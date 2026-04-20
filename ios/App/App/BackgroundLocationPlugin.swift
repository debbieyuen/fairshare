import Foundation
import Capacitor
import CoreLocation

@objc(BackgroundLocationPlugin)
public class BackgroundLocationPlugin: CAPPlugin, CLLocationManagerDelegate {
    private var locationManager: CLLocationManager?
    private var lastPosition: CLLocation?

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
    // fix. If Core Location hasn't delivered anything new by then we fall back
    // to whatever we have.
    private let freshFixDeadline: TimeInterval = 12

    // MARK: - Plugin methods

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.ensureLocationManager()

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
        // Fresh enough? Return immediately.
        if let loc = lastPosition,
           Date().timeIntervalSince(loc.timestamp) < cachedLocationMaxAge {
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
                // Time is up. Resolve any of our pending calls with whatever
                // we have (even if it's the stale fix, so JS isn't stuck).
                self.flushPendingCalls(force: true)
            }
        }
    }

    // MARK: - Delegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Use the most recent acceptable fix. Core Location occasionally
        // hands back cached locations many seconds old when updates first
        // start; skip those in favor of newer ones if present.
        guard let location = mostRecent(of: locations) else { return }
        let age = Date().timeIntervalSince(location.timestamp)
        NSLog("[BackgroundLocation] didUpdateLocations lat=\(location.coordinate.latitude) lng=\(location.coordinate.longitude) horizAcc=\(location.horizontalAccuracy)m age=\(String(format: "%.1f", age))s")
        lastPosition = location
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
        }
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
    /// arrived). When `force` is true we resolve everyone with whatever we
    /// have so callers aren't stuck waiting forever.
    private func flushPendingCalls(force: Bool) {
        guard !pendingFreshCalls.isEmpty else { return }
        let current = lastPosition
        var remaining: [(call: CAPPluginCall, previousTimestamp: Date?)] = []

        for entry in pendingFreshCalls {
            if let loc = current,
               force || loc.timestamp != entry.previousTimestamp {
                entry.call.resolve([
                    "lat": loc.coordinate.latitude,
                    "lng": loc.coordinate.longitude
                ])
            } else if force {
                entry.call.reject("Could not get location")
            } else {
                remaining.append(entry)
            }
        }
        pendingFreshCalls = remaining
    }
}
