import UIKit
import Capacitor

class BounceViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
    }
}
