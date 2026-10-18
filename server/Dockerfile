# Sonicake NAM -> CLO compiler for Linux ARM64 (e.g. Oracle Ampere VPS).
#
# The conversion uses the vendor ARM64 library from the SonicLink Android app (lib5868USB.so),
# which is linked against Android's bionic libc. We run it on plain Linux by shipping a minimal
# bionic runtime (linker64 + libc/libm/libdl) taken from the AOSP redroid image, plus stubs for
# the Android system libraries it lists but does not use for conversion.
#
# Build (vendor files first: see nam2clo/build.ps1):
#   docker build --platform linux/arm64 -t sonicake-compiler -f server/Dockerfile server
# Run:
#   docker run -d --name sonicake-compiler -p 127.0.0.1:8080:8080 -v sonicake-cache:/app/cache sonicake-compiler

FROM --platform=linux/arm64 redroid/redroid:13.0.0-latest AS android

FROM --platform=linux/arm64 python:3.12-slim-bookworm

# --- Android bionic runtime (AOSP, flattened com.android.runtime APEX) ---
COPY --from=android /system/apex/com.android.runtime/bin/linker64 /system/bin/linker64
COPY --from=android /system/apex/com.android.runtime/lib64/bionic/libc.so \
                    /system/apex/com.android.runtime/lib64/bionic/libm.so \
                    /system/apex/com.android.runtime/lib64/bionic/libdl.so \
                    /system/apex/com.android.runtime/lib64/bionic/libdl_android.so \
                    /system/lib64/
COPY --from=android /system/lib64/ld-android.so /system/lib64/

# --- Stubs for Android system libraries (log, OpenSL ES, EGL/GLES, libandroid) ---
COPY nam2clo/build/liblog.so nam2clo/build/libOpenSLES.so nam2clo/build/libandroid.so \
     nam2clo/build/libEGL.so nam2clo/build/libGLESv2.so /system/lib64/

# --- Converter + vendor files (never committed to git) ---
COPY nam2clo/build/nam2clo nam2clo/vendor/lib5868USB.so nam2clo/vendor/libc++_shared.so \
     nam2clo/vendor/nam_input_wav.wav /opt/nam2clo/
RUN chmod 755 /system/bin/linker64 /opt/nam2clo/nam2clo && mkdir -p /opt/nam2clo/cache

ENV NAM2CLO_BIN=/opt/nam2clo/nam2clo \
    NAM2CLO_LIB=/opt/nam2clo/lib5868USB.so \
    SONICAKE_NAM_INPUT_WAV=/opt/nam2clo/nam_input_wav.wav \
    NAM2CLO_CACHE_DIR=/opt/nam2clo/cache

# --- Compiler web service ---
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py /app/server.py
RUN mkdir -p /app/cache

EXPOSE 8080
ENV PORT=8080 \
    PYTHONUNBUFFERED=1
# Production WSGI server (conversions are long requests: generous channel timeout)
CMD ["waitress-serve", "--host=0.0.0.0", "--port=8080", "--threads=8", "--channel-timeout=600", "server:app"]
