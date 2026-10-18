/*
 * nam2clo - headless NAM -> Sonicake CLO converter (8,840 bytes) using the vendor ARM64 library
 * (lib5868USB.so from the SonicLink Android app). Same entry point and calling convention that
 * Sonicake Manager uses with 5868USB.dll on Windows:
 *
 *   int namConvertCloDataWithProcess(void *ctx, const char *inWav, const char *outWav,
 *                                    const char *namPath, uint8_t *cloOut,
 *                                    int *outSize, int *progress, int *total);
 *
 * Returns immediately; a worker thread renders `inWav` through the NAM model and fits the CLO.
 * Done when *outSize == 8840, failed when *progress or *total == -2.
 *
 * Usage: nam2clo <lib5868USB.so> <nam_input_wav.wav> <model.nam> <out.clo> [timeout_s]
 * Exit codes: 0 ok, 1 usage, 2 library, 3 conversion error, 4 timeout, 5 output write.
 */
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define CLO_SIZE 8840

typedef int (*convert_fn)(void *, const char *, const char *, const char *, uint8_t *, int *, int *, int *);
typedef const char *(*error_fn)(void);

static double now_s(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec + ts.tv_nsec / 1e9;
}

int main(int argc, char **argv) {
    if (argc < 5) {
        fprintf(stderr, "usage: %s <lib5868USB.so> <input.wav> <model.nam> <out.clo> [timeout_s]\n", argv[0]);
        return 1;
    }
    const char *lib_path = argv[1], *in_wav = argv[2], *nam = argv[3], *out_path = argv[4];
    double timeout = argc > 5 ? atof(argv[5]) : 300.0;

    void *lib = dlopen(lib_path, RTLD_NOW);
    if (!lib) { fprintf(stderr, "dlopen failed: %s\n", dlerror()); return 2; }
    convert_fn convert = (convert_fn)dlsym(lib, "namConvertCloDataWithProcess");
    error_fn last_error = (error_fn)dlsym(lib, "getNamConvertCloErrorMessage");
    if (!convert) { fprintf(stderr, "symbol namConvertCloDataWithProcess not found\n"); return 2; }

    /* Scratch output wav next to the result */
    char out_wav[4096];
    snprintf(out_wav, sizeof out_wav, "%s.render.wav", out_path);

    /* The library treats ctx as an opaque object it lazily initialises: a zeroed block is enough */
    void *ctx = calloc(1, 64 * 1024);
    uint8_t *clo = (uint8_t *)calloc(1, CLO_SIZE);
    volatile int out_size = 0, progress = 0, total = 0;

    double t0 = now_s();
    int ret = convert(ctx, in_wav, out_wav, nam, clo, (int *)&out_size, (int *)&progress, (int *)&total);
    fprintf(stderr, "started (ret=%d)\n", ret);

    int last_pct = -1;
    for (;;) {
        if (out_size == CLO_SIZE) break;
        if (progress == -2 || total == -2) {
            fprintf(stderr, "conversion failed: %s\n", last_error ? last_error() : "unknown");
            return 3;
        }
        if (now_s() - t0 > timeout) { fprintf(stderr, "timeout after %.0fs\n", timeout); return 4; }
        if (total > 0) {
            int pct = (int)(100.0 * progress / total);
            if (pct / 10 != last_pct / 10) { fprintf(stderr, "progress %d%%\n", pct); last_pct = pct; }
        }
        usleep(100 * 1000);
    }
    usleep(300 * 1000); /* let the worker finish its teardown before reading the buffer */

    FILE *f = fopen(out_path, "wb");
    if (!f || fwrite(clo, 1, CLO_SIZE, f) != CLO_SIZE) { fprintf(stderr, "cannot write %s\n", out_path); return 5; }
    fclose(f);
    unlink(out_wav);
    fprintf(stderr, "done in %.1fs\n", now_s() - t0);
    printf("%s\n", out_path);
    return 0;
}
