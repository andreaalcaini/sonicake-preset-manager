/**
 * Feature switches for the published site.
 * Disabled features keep their code (modals, engine methods) but are hidden from the UI and
 * their shortcuts are not registered. Set to true to bring one back.
 */
export const FEATURES = {
  backingTrack: false,   // Player basi (BackingTrackModal)
  toneGenerator: false,  // Smart Tone Generator (ToneGeneratorModal)
  abCompare: false       // Confronto A/B + scorciatoia Alt+A
};

/** Remove every element tagged with data-feature="<name>" whose feature is disabled */
export function applyFeatureFlags(root = document) {
  root.querySelectorAll('[data-feature]').forEach(el => {
    if (FEATURES[el.dataset.feature] === false) el.remove();
  });
}
