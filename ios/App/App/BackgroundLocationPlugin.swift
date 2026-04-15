import Foundation
import Capacitor
import CoreLocation

@objc(BackgroundLocationPlugin)
public class BackgroundLocationPlugin: CAPPlugin, CLLocationManagerDelegate {
    private var locationManager: CLLocationManager?
    private var lastPosition: CLLocation?

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.locationManager == nil {
                self.locationManager = CLLocationManager()
                self.locationManager?.delegate = self
                self.locationManager?.desiredAccuracy = kCLAccuracyHundredMeters
                self.locationManager?.distanceFilter = 100
                self.locationManager?.allowsBackgroundLocationUpdates = true
                self.locationManager?.pausesLocationUpdatesAutomatically = false
            }

            let status = self.locationManager?.authorizationStatus ?? .notDetermined
            if status == .notDetermined {
                self.locationManager?.requestAlwaysAuthorization()
            } else if status == .authorizedWhenInUse {
                self.locationManager?.requestAlwaysAuthorization()
            }

            self.locationManager?.startUpdatingLocation()
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
        if let loc = lastPosition {
            call.resolve([
                "lat": loc.coordinate.latitude,
                "lng": loc.coordinate.longitude
            ])
        } else {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else {
                    call.reject("Plugin not ready")
                    return
                }
                if self.locationManager == nil {
                    self.locationManager = CLLocationManager()
                    self.locationManager?.delegate = self
                    self.locationManager?.desiredAccuracy = kCLAccuracyHundredMeters
                }
                self.locationManager?.requestLocation()
                DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
                    if let loc = self?.lastPosition {
                        call.resolve([
                            "lat": loc.coordinate.latitude,
                            "lng": loc.coordinate.longitude
                        ])
                    } else {
                        call.reject("Could not get location")
                    }
                }
            }
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        lastPosition = location
        notifyListeners("locationUpdate", data: [
            "lat": location.coordinate.latitude,
            "lng": location.coordinate.longitude
        ])
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[BackgroundLocation] Error: \(error.localizedDescription)")
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            manager.startUpdatingLocation()
        }
    }
}
