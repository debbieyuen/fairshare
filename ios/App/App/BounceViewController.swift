import UIKit
import Capacitor

class BounceViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // Register locally-defined Capacitor plugins that live inside the app
        // target (not in node_modules). These are not picked up by `cap sync`,
        // which only scans npm packages when generating `packageClassList` in
        // `capacitor.config.json`, so we must register them manually here so
        // the JS bridge exposes `Capacitor.Plugins.BackgroundLocation`.
        bridge?.registerPluginInstance(BackgroundLocationPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
    }
}
