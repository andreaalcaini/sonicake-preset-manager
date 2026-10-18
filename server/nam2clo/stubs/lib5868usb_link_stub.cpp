/*
 * Link-time stand-in for the vendor lib5868USB.so (never shipped, never executed).
 *
 * nam2clo's JUCE shim calls four juce::String / juce::File members exported by the vendor
 * library. CI cannot have the proprietary .so, so we link against this stub that exports the
 * same symbols with the same SONAME; at runtime the dynamic linker loads the real library
 * mounted from the server's data/vendor directory.
 */
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
    File(const String &absolutePath);
private:
    String fullPath;
};

String::String(const char *) : text(nullptr) {}
String::String(const String &) : text(nullptr) {}
String::~String() {}
File::File(const String &p) : fullPath(p) {}
} // namespace juce
