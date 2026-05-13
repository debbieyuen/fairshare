package social.fairshare.union;

import android.os.Bundle;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        injectAndroidFcmFlag();
    }

    /**
     * Capacitor PushNotifications on Android calls FirebaseMessaging.getInstance(),
     * which crashes if {@code google-services.json} is missing. The web layer
     * reads {@code window.__UNION_ANDROID_FCM__} to avoid calling register() until
     * Firebase is configured.
     */
    private void injectAndroidFcmFlag() {
        boolean enabled = BuildConfig.HAS_GOOGLE_SERVICES;
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        String js = "window.__UNION_ANDROID_FCM__=" + (enabled ? "true" : "false") + ";";
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
    }
}
