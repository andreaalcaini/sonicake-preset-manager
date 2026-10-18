/* Minimal liblog replacement for running lib5868USB.so outside Android.
 * Logs go to stderr only when NAM2CLO_VERBOSE is set. */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>

static int verbose(void) { const char *v = getenv("NAM2CLO_VERBOSE"); return v && *v && *v != '0'; }

int __android_log_vprint(int prio, const char *tag, const char *fmt, va_list ap) {
    if (!verbose()) return 0;
    fprintf(stderr, "[%d %s] ", prio, tag ? tag : "");
    vfprintf(stderr, fmt, ap);
    fputc('\n', stderr);
    return 1;
}

int __android_log_print(int prio, const char *tag, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int r = __android_log_vprint(prio, tag, fmt, ap);
    va_end(ap);
    return r;
}

int __android_log_write(int prio, const char *tag, const char *text) {
    return __android_log_print(prio, tag, "%s", text ? text : "");
}
