/*
 * Interposer for the vendor ARM64 lib5868USB.so (SonicLink Android build).
 *
 * The conversion thread opens a log file under getCacheDicPath(), which calls
 * juce::File::getSpecialLocation(). On Android JUCE resolves that through JNI (app context),
 * and our headless process has no Java VM -> null JNIEnv -> SIGSEGV.
 *
 * The library calls getSpecialLocation through its PLT, so defining the same symbol in the
 * executable (exported with -rdynamic) takes precedence. We return a plain directory instead,
 * built with the library's own exported juce::String / juce::File constructors.
 */
#include <stdlib.h>

namespace juce {
class String {
public:
    String(const char *text);
    String(const String &other);
    ~String();
private:
    void *text;
};

class File {
public:
    enum SpecialLocationType { userHomeDirectory = 0 };
    File(const String &absolutePath);
    static File getSpecialLocation(SpecialLocationType type);
private:
    String fullPath;
};

File File::getSpecialLocation(SpecialLocationType) {
    const char *dir = getenv("NAM2CLO_CACHE_DIR");
    return File(String(dir && *dir ? dir : "/tmp"));
}
} // namespace juce
