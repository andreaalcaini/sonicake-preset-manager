/* OpenSL ES stub: lib5868USB.so links the drum-machine audio engine against OpenSL ES, but the
 * NAM -> CLO conversion never plays audio. Interface IDs exist, engine creation reports
 * SL_RESULT_FEATURE_UNSUPPORTED. */
#include <stddef.h>
#include <stdint.h>

typedef uint32_t SLresult;
typedef const void *SLInterfaceID;
#define SL_RESULT_FEATURE_UNSUPPORTED ((SLresult)0x0000000C)

static const uint8_t iid_storage[6][16];
const SLInterfaceID SL_IID_ENGINE = &iid_storage[0];
const SLInterfaceID SL_IID_PLAY = &iid_storage[1];
const SLInterfaceID SL_IID_RECORD = &iid_storage[2];
const SLInterfaceID SL_IID_BUFFERQUEUE = &iid_storage[3];
const SLInterfaceID SL_IID_ANDROIDSIMPLEBUFFERQUEUE = &iid_storage[4];
const SLInterfaceID SL_IID_ANDROIDCONFIGURATION = &iid_storage[5];

SLresult slCreateEngine(void **pEngine, uint32_t numOptions, const void *pEngineOptions,
                        uint32_t numInterfaces, const SLInterfaceID *pInterfaceIds,
                        const uint32_t *pInterfaceRequired) {
    (void)numOptions; (void)pEngineOptions; (void)numInterfaces; (void)pInterfaceIds; (void)pInterfaceRequired;
    if (pEngine) *pEngine = NULL;
    return SL_RESULT_FEATURE_UNSUPPORTED;
}
