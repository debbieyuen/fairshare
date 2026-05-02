#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BackgroundLocationPlugin, "BackgroundLocation",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCurrentPosition, CAPPluginReturnPromise);
)
