# syntax=docker/dockerfile:1
#
# Sonicake Pedaliera: static site (Vite) + NAM compiler API in one multi-arch image
# (linux/amd64 + linux/arm64). Build-heavy stages run natively on $BUILDPLATFORM so the
# arm64 build never waits on QEMU emulation.
#
# The NAM -> Clone AMP converter uses the vendor ARM64 library from the SonicLink Android app.
# Those files are proprietary and are NOT part of the image: mount them at runtime in
# /app/data/vendor (lib5868USB.so, libc++_shared.so, nam_input_wav.wav). The converter works
# on arm64 hosts only; on amd64 the site runs and the compiler reports "offline".

# 1. Dipendenze (native)
FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
RUN npm ci

# 2. Builder frontend nativo veloce
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build identifier shown to open pages as "update available" (CI passes the commit SHA)
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

# 3. nam2clo + Android system-library stubs (the NDK ships x86_64 toolchains only;
#    the output is always Android arm64 regardless of the target platform)
FROM --platform=linux/amd64 debian:bookworm-slim AS nam2clo
ARG NDK_VERSION=r27c
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/ndk.zip "https://dl.google.com/android/repository/android-ndk-${NDK_VERSION}-linux.zip" \
 && unzip -q /tmp/ndk.zip "android-ndk-${NDK_VERSION}/toolchains/llvm/*" -d /opt \
 && rm /tmp/ndk.zip
ENV TC=/opt/android-ndk-${NDK_VERSION}/toolchains/llvm/prebuilt/linux-x86_64
WORKDIR /src
COPY backend/nam2clo/nam2clo.c backend/nam2clo/juce_android_shim.cpp ./
COPY backend/nam2clo/stubs/ ./stubs/
RUN set -e; mkdir -p /out /link; \
    CC="$TC/bin/aarch64-linux-android24-clang"; CXX="$TC/bin/aarch64-linux-android24-clang++"; \
    # link-time stand-in for the vendor library (real one is mounted at runtime)
    $CXX -O2 -shared -fPIC -Wl,-soname,lib5868USB.so -o /link/lib5868USB.so stubs/lib5868usb_link_stub.cpp; \
    $CXX -O2 -Wall -Wno-deprecated -rdynamic -o /out/nam2clo -x c++ nam2clo.c juce_android_shim.cpp -L/link -l5868USB -ldl; \
    $CC -O2 -shared -fPIC -Wl,-soname,liblog.so -o /out/liblog.so stubs/liblog_stub.c; \
    $CC -O2 -shared -fPIC -Wl,-soname,libOpenSLES.so -o /out/libOpenSLES.so stubs/libopensles_stub.c; \
    for lib in libandroid libEGL libGLESv2; do \
      $CC -O2 -shared -fPIC -Wl,-soname,$lib.so -o /out/$lib.so stubs/empty_stub.c; \
    done; \
    # fallback C++ runtime (the vendor copy in data/vendor takes precedence)
    cp "$TC/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" /out/

# 4. Android bionic runtime (AOSP redroid, flattened com.android.runtime APEX)
FROM --platform=linux/arm64 redroid/redroid:13.0.0-latest AS android

# 5. Python dependencies resolved natively, downloaded as wheels for the target architecture
#    (never installed with the runner's architecture: charset_normalizer ships compiled modules)
FROM --platform=$BUILDPLATFORM python:3.12-slim-bookworm AS pydeps
ARG TARGETARCH
COPY backend/requirements.txt /tmp/requirements.txt
RUN case "$TARGETARCH" in \
      arm64) plat=manylinux2014_aarch64 ;; \
      amd64) plat=manylinux2014_x86_64 ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    pip install --no-cache-dir --target /deps --platform "$plat" --implementation cp \
      --python-version 3.12 --only-binary=:all: -r /tmp/requirements.txt

# 6. Runner finale multi-arch
FROM python:3.12-slim-bookworm AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/deps \
    PORT=3000 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static \
    NAM2CLO_BIN=/opt/nam2clo/nam2clo \
    NAM2CLO_LIB=/app/data/vendor/lib5868USB.so \
    SONICAKE_NAM_INPUT_WAV=/app/data/vendor/nam_input_wav.wav \
    NAM2CLO_CACHE_DIR=/tmp \
    NAM2CLO_WORKERS=2 \
    HOST_REDIRECTS=sonicake.alcaini.it=sonicstudio.alcaini.it

COPY --from=android /system/apex/com.android.runtime/bin/linker64 /system/bin/linker64
COPY --from=android /system/apex/com.android.runtime/lib64/bionic/libc.so \
                    /system/apex/com.android.runtime/lib64/bionic/libm.so \
                    /system/apex/com.android.runtime/lib64/bionic/libdl.so \
                    /system/apex/com.android.runtime/lib64/bionic/libdl_android.so \
                    /system/lib64/
COPY --from=android /system/lib64/ld-android.so /system/lib64/
COPY --from=nam2clo /out/liblog.so /out/libOpenSLES.so /out/libandroid.so /out/libEGL.so /out/libGLESv2.so /system/lib64/
COPY --from=nam2clo /out/nam2clo /out/libc++_shared.so /opt/nam2clo/

COPY --from=pydeps /deps /deps

RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --no-create-home app \
 && mkdir -p /app/data/vendor /app/data/cache \
 && chown -R app:app /app/data

COPY backend/server.py ./server.py
COPY --from=builder /app/frontend/dist ./static

USER app
EXPOSE 3000
CMD ["python", "-m", "waitress", "--host=0.0.0.0", "--port=3000", "--threads=8", "--channel-timeout=600", "server:app"]
