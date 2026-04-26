import Foundation
import Capacitor
import CoreLocation
import UIKit

@objc(BackgroundLocationPlugin)
public class BackgroundLocationPlugin: CAPPlugin, CLLocationManagerDelegate {
    private var locationManager: CLLocationManager?
    private var lastPosition: CLLocation?
    private var supabaseConfig: SupabaseLocationConfig?
    private var pendingUploadLocation: CLLocation?
    private var uploadInFlight = false
    private var uploadRetryWorkItem: DispatchWorkItem?

    // Queue of pending one-shot getCurrentPosition calls waiting on a fresh fix.
    // Each entry pairs a call with the previous fix timestamp it considers
    // "already seen", so we only resolve it once a genuinely new fix arrives.
    private var pendingFreshCalls: [(call: CAPPluginCall, previousTimestamp: Date?)] = []

    // Maximum age of a cached fix before getCurrentPosition forces a refresh.
    // Anything older risks sending stale coordinates to the server (e.g. when
    // the device has been stationary and Core Location's distanceFilter has
    // suppressed new updates).
    private let cachedLocationMaxAge: TimeInterval = 30

    // Hard deadline for a pending getCurrentPosition call waiting on a fresh
    // fix. If Core Location hasn't delivered anything new by then we give up
    // and let JS treat this poll as "no fix" rather than writing stale
    // coordinates to the DB.
    private let freshFixDeadline: TimeInterval = 12

    // Maximum age, in seconds, of a `CLLocation.timestamp` we'll accept from
    // Core Location. iOS often replays a cached fix (sometimes hours or days
    // old, e.g. after the device travels with the app force-quit) when
    // `startUpdatingLocation` first runs or when the app foregrounds. Those
    // cached fixes were getting forwarded to JS as if they were "live", which
    // is how a phone in Denver kept reporting San Francisco coordinates with
    // a fresh `updated_at`.
    private let acceptedFixMaxAge: TimeInterval = 60

    // Reject fixes whose horizontal accuracy is non-positive (Core Location
    // uses negative values to signal an invalid fix). We don't apply a strict
    // upper bound because that disqualifies indoor users entirely; the age
    // check above is the main defense against stale-cache replay.
    private let minAcceptableHorizontalAccuracy: CLLocationAccuracy = 0
    private let locationUploadRetryDelay: TimeInterval = 15

    private struct SupabaseLocationConfig: Codable {
        let supabaseUrl: String
        let anonKey: String
        let accessToken: String
        let userId: String
        let instanceId: String?
        let sourcePlatform: String?
        let sourceUserAgent: String?
    }

    private let configDefaultsKey = "BackgroundLocationSupabaseConfig"
    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    // MARK: - Plugin methods

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.ensureLocationManager()
            self.updateSupabaseConfig(from: call)

            let status = self.locationManager?.authorizationStatus ?? .notDetermined
            NSLog("[BackgroundLocation] start() called, authorizationStatus=\(self.describe(status))")

            switch status {
            case .notDetermined:
                self.locationManager?.requestAlwaysAuthorization()
            case .authorizedWhenInUse:
                self.locationManager?.requestAlwaysAuthorization()
            case .denied, .restricted:
                NSLog("[BackgroundLocation] start(): Location services are denied/restricted. User must enable in Settings -> Privacy -> Location Services -> Union.")
            default:
                break
            }

            self.applyBackgroundUpdatesIfAuthorized()
            self.locationManager?.startUpdatingLocation()
            NSLog("[BackgroundLocation] startUpdatingLocation called")
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.locationManager?.stopUpdatingLocation()
            call.resolve()
        }
    }

    @objc func getCurrentPosition(_ call: CAPPluginCall) {
        // Fresh enough? Return immediately. We require both a recent timestamp
        // and a valid horizontal accuracy — Core Location returns negative
        // accuracy for invalid/cached fixes, which we never want to write.
        if let loc = lastPosition,
           Date().timeIntervalSince(loc.timestamp) < cachedLocationMaxAge,
           loc.horizontalAccuracy > minAcceptableHorizontalAccuracy {
            call.resolve([
                "lat": loc.coordinate.latitude,
                "lng": loc.coordinate.longitude
            ])
            return
        }

        // Otherwise, kick location services to deliver a new fix and queue the
        // call to resolve as soon as a newer `didUpdateLocations` arrives.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin not ready")
                return
            }
            self.ensureLocationManager()

            let previousTimestamp = self.lastPosition?.timestamp
            self.pendingFreshCalls.append((call, previousTimestamp))

            // Make sure updates are actively flowing. startUpdatingLocation is
            // idempotent, and with a small distanceFilter this tends to produce
            // a new fix within a few seconds even while the user is mostly
            // stationary (GPS drift alone usually triggers an update).
            self.applyBackgroundUpdatesIfAuthorized()
            self.locationManager?.startUpdatingLocation()
            self.locationManager?.requestLocation()

            DispatchQueue.main.asyncAfter(deadline: .now() + self.freshFixDeadline) { [weak self] in
                guard let self = self else { return }
                // Time is up. flushPendingCalls(force: true) will reject any
                // pending callers if we still don't have a sufficiently
                // fresh fix — JS treats that as "no fix this poll" and
                // skips the upsert, which is the desired behavior here.
                self.flushPendingCalls(force: true)
            }
        }
    }

    // MARK: - Delegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Use the most recent acceptable fix. Core Location occasionally
        // hands back cached locations that are seconds — or, after travel
        // with the app force-quit, hours/days — old. We need to drop those
        // before they get forwarded to JS, otherwise they end up in the DB
        // stamped with a fresh `updated_at`.
        guard let location = mostRecent(of: locations) else { return }
        let age = Date().timeIntervalSince(location.timestamp)

        if location.horizontalAccuracy <= minAcceptableHorizontalAccuracy {
            NSLog("[BackgroundLocation] discarding fix with invalid accuracy=\(location.horizontalAccuracy) age=\(String(format: "%.1f", age))s")
            return
        }
        if isSimulatedLocation(location) {
            NSLog("[BackgroundLocation] discarding simulated location lat=\(location.coordinate.latitude) lng=\(location.coordinate.longitude)")
            return
        }
        if age > acceptedFixMaxAge {
            NSLog("[BackgroundLocation] discarding stale cached fix age=\(String(format: "%.1f", age))s lat=\(location.coordinate.latitude) lng=\(location.coordinate.longitude)")
            // Kick the manager so we get a real fix soon. requestLocation()
            // is idempotent and forces Core Location to deliver a single
            // fresh sample, which will overwrite the cached one.
            manager.requestLocation()
            return
        }

        NSLog("[BackgroundLocation] didUpdateLocations lat=\(location.coordinate.latitude) lng=\(location.coordinate.longitude) horizAcc=\(location.horizontalAccuracy)m age=\(String(format: "%.1f", age))s")
        lastPosition = location
        postLocationToSupabase(location)
        notifyListeners("locationUpdate", data: [
            "lat": location.coordinate.latitude,
            "lng": location.coordinate.longitude
        ])
        flushPendingCalls(force: false)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("[BackgroundLocation] didFailWithError: \(error.localizedDescription)")
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        NSLog("[BackgroundLocation] authorization changed -> \(describe(status))")
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            applyBackgroundUpdatesIfAuthorized()
            manager.startUpdatingLocation()
        }
    }

    // MARK: - Helpers

    private func ensureLocationManager() {
        if locationManager == nil {
            let manager = CLLocationManager()
            manager.delegate = self
            // Sharing your live location with a contact is a foreground-ish
            // use case. Nearest-ten-meters gives reasonable accuracy without
            // draining battery the way kCLAccuracyBest would, and a small
            // distanceFilter means Core Location pushes us updates shortly
            // after any real movement instead of waiting for a 100m hop.
            manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
            manager.distanceFilter = 10
            manager.pausesLocationUpdatesAutomatically = false
            locationManager = manager
            loadSupabaseConfig()
        }
    }

    private func updateSupabaseConfig(from call: CAPPluginCall) {
        guard
            let supabaseUrl = call.getString("supabaseUrl"), !supabaseUrl.isEmpty,
            let anonKey = call.getString("anonKey"), !anonKey.isEmpty,
            let accessToken = call.getString("accessToken"), !accessToken.isEmpty,
            let userId = call.getString("userId"), !userId.isEmpty
        else {
            loadSupabaseConfig()
            return
        }

        let config = SupabaseLocationConfig(
            supabaseUrl: supabaseUrl,
            anonKey: anonKey,
            accessToken: accessToken,
            userId: userId,
            instanceId: call.getString("instanceId"),
            sourcePlatform: call.getString("sourcePlatform"),
            sourceUserAgent: call.getString("sourceUserAgent")
        )
        supabaseConfig = config
        if let encoded = try? JSONEncoder().encode(config) {
            UserDefaults.standard.set(encoded, forKey: configDefaultsKey)
        }
        startNextLocationUploadIfNeeded()
    }

    private func loadSupabaseConfig() {
        if supabaseConfig != nil { return }
        guard let data = UserDefaults.standard.data(forKey: configDefaultsKey),
              let config = try? JSONDecoder().decode(SupabaseLocationConfig.self, from: data)
        else { return }
        supabaseConfig = config
    }

    private func postLocationToSupabase(_ location: CLLocation) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.pendingUploadLocation = location
            self.uploadRetryWorkItem?.cancel()
            self.uploadRetryWorkItem = nil
            self.startNextLocationUploadIfNeeded()
        }
    }

    private func startNextLocationUploadIfNeeded() {
        guard !uploadInFlight else { return }
        guard let location = pendingUploadLocation else { return }
        guard let config = supabaseConfig else {
            NSLog("[BackgroundLocation] no Supabase config; keeping latest location pending")
            return
        }
        pendingUploadLocation = nil
        uploadInFlight = true

        guard var components = URLComponents(string: config.supabaseUrl + "/rest/v1/user_locations") else {
            NSLog("[BackgroundLocation] invalid Supabase URL")
            uploadInFlight = false
            pendingUploadLocation = location
            return
        }
        components.queryItems = [URLQueryItem(name: "on_conflict", value: "user_id")]
        guard let url = components.url else {
            NSLog("[BackgroundLocation] could not build user_locations URL")
            uploadInFlight = false
            pendingUploadLocation = location
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(config.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")

        var body: [String: Any] = [
            "user_id": config.userId,
            "lat": location.coordinate.latitude,
            "lng": location.coordinate.longitude,
            "updated_at": isoFormatter.string(from: Date())
        ]
        if let instanceId = config.instanceId { body["source_instance_id"] = instanceId }
        if let sourcePlatform = config.sourcePlatform { body["source_platform"] = sourcePlatform }
        if let sourceUserAgent = config.sourceUserAgent { body["source_user_agent"] = sourceUserAgent }
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        } catch {
            NSLog("[BackgroundLocation] failed to encode location body: \(error.localizedDescription)")
            uploadInFlight = false
            pendingUploadLocation = location
            return
        }

        var backgroundTask: UIBackgroundTaskIdentifier = .invalid
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "UploadLocation") {
            if backgroundTask != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTask)
                backgroundTask = .invalid
            }
        }

        let session = makeLocationUploadSession()
        session.dataTask(with: request) { [weak self] _, response, error in
            defer {
                if backgroundTask != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTask)
                }
            }
            if let error = error {
                NSLog("[BackgroundLocation] Supabase location upload failed: \(error.localizedDescription)")
                DispatchQueue.main.async {
                    self?.handleLocationUploadFinished(location: location, succeeded: false)
                }
                return
            }
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if statusCode < 200 || statusCode >= 300 {
                NSLog("[BackgroundLocation] Supabase location upload returned HTTP \(statusCode)")
                DispatchQueue.main.async {
                    self?.handleLocationUploadFinished(location: location, succeeded: false)
                }
                return
            }
            NSLog("[BackgroundLocation] Supabase location upload succeeded")
            DispatchQueue.main.async {
                self?.handleLocationUploadFinished(location: location, succeeded: true)
            }
        }.resume()
    }

    private func makeLocationUploadSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = true
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 30
        return URLSession(configuration: config)
    }

    private func handleLocationUploadFinished(location: CLLocation, succeeded: Bool) {
        uploadInFlight = false
        if !succeeded {
            if pendingUploadLocation == nil ||
                (pendingUploadLocation?.timestamp ?? .distantPast) <= location.timestamp {
                pendingUploadLocation = location
            }
            scheduleLocationUploadRetry()
            return
        }
        startNextLocationUploadIfNeeded()
    }

    private func scheduleLocationUploadRetry() {
        guard uploadRetryWorkItem == nil else { return }
        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            self.uploadRetryWorkItem = nil
            self.startNextLocationUploadIfNeeded()
        }
        uploadRetryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + locationUploadRetryDelay, execute: workItem)
    }

    /// `allowsBackgroundLocationUpdates` requires Always authorization at the
    /// time it's set. Setting it earlier is ignored (or on some iOS versions,
    /// logs a runtime warning), so we defer it until we actually have the
    /// right permission.
    private func applyBackgroundUpdatesIfAuthorized() {
        guard let manager = locationManager else { return }
        let status = manager.authorizationStatus
        if status == .authorizedAlways {
            if !manager.allowsBackgroundLocationUpdates {
                manager.allowsBackgroundLocationUpdates = true
            }
        } else {
            if manager.allowsBackgroundLocationUpdates {
                manager.allowsBackgroundLocationUpdates = false
            }
        }
    }

    private func mostRecent(of locations: [CLLocation]) -> CLLocation? {
        return locations.max(by: { $0.timestamp < $1.timestamp })
    }

    private func isSimulatedLocation(_ location: CLLocation) -> Bool {
        if #available(iOS 15.0, *) {
            return location.sourceInformation?.isSimulatedBySoftware == true
        }
        return false
    }

    private func describe(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorizedAlways: return "authorizedAlways"
        case .authorizedWhenInUse: return "authorizedWhenInUse"
        @unknown default: return "unknown(\(status.rawValue))"
        }
    }

    /// Resolve any pending getCurrentPosition calls. When `force` is false,
    /// we only resolve calls whose `previousTimestamp` differs from the
    /// current `lastPosition.timestamp` (i.e. a new fix has genuinely
    /// arrived). When `force` is true the caller's deadline is up; in that
    /// case we still only resolve with `lastPosition` if it's *both* newer
    /// than what the caller had AND fresh enough to be worth writing. We'd
    /// rather have JS treat this poll as "no fix" and skip the upsert than
    /// send stale coordinates to Supabase with a fresh `updated_at`.
    private func flushPendingCalls(force: Bool) {
        guard !pendingFreshCalls.isEmpty else { return }
        let current = lastPosition
        var remaining: [(call: CAPPluginCall, previousTimestamp: Date?)] = []

        for entry in pendingFreshCalls {
            let isNew = current.map { $0.timestamp != entry.previousTimestamp } ?? false
            let isFreshEnough = current.map {
                Date().timeIntervalSince($0.timestamp) <= acceptedFixMaxAge &&
                    $0.horizontalAccuracy > minAcceptableHorizontalAccuracy
            } ?? false

            if let loc = current, isNew, isFreshEnough {
                entry.call.resolve([
                    "lat": loc.coordinate.latitude,
                    "lng": loc.coordinate.longitude
                ])
            } else if force {
                NSLog("[BackgroundLocation] getCurrentPosition timed out without a fresh fix (had cached fix: \(current != nil))")
                entry.call.reject("Could not get fresh location")
            } else {
                remaining.append(entry)
            }
        }
        pendingFreshCalls = remaining
    }
}
