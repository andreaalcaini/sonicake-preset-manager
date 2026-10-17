/**
 * Sonicake Smart Box Preset Manager - Main Application Entrypoint
 * Coordinates components, connections, shortcuts, and bidirectional hardware syncing.
 */

import { connection } from './core/connection.js';
import { presetEngine } from './core/preset-engine.js';

import { SignalChain } from './components/SignalChain.js';
import { ModuleEditor } from './components/ModuleEditor.js';
import { PresetList } from './components/PresetList.js';
import { Tone3000Modal } from './components/Tone3000Modal.js';
import { DrumMachineModal } from './components/DrumMachineModal.js';
import { TunerModal } from './components/TunerModal.js';
import { SaveModal } from './components/SaveModal.js';
import { ExportModal } from './components/ExportModal.js';
import { SlotTransferModal } from './components/SlotTransferModal.js';
import { StageModeModal } from './components/StageModeModal.js';
import { ToneGeneratorModal } from './components/ToneGeneratorModal.js';
import { HelpModal } from './components/HelpModal.js';
import { SharePresetModal } from './components/SharePresetModal.js';
import { ImportBundleModal } from './components/ImportBundleModal.js';
import { SetlistModal } from './components/SetlistModal.js';
import { BackingTrackModal } from './components/BackingTrackModal.js';
import { decodePresetBundle } from './utils/bundle-encoder.js';

class App {
  constructor() {
    this.initUI();
    this.initShortcuts();
    this.initDragAndDrop();
    this.checkSharedUrlOnLaunch();
  }

  initUI() {
    // 1. Core UI Components
    const moduleEditor = new ModuleEditor(document.getElementById('moduleEditorArea'));
    const signalChain = new SignalChain(
      document.getElementById('signalChainRack'),
      (modId) => moduleEditor.setModule(modId)
    );
    const presetList = new PresetList(document.getElementById('presetSidebar'));

    // 2. Modals
    const tone3000Modal = new Tone3000Modal(document.getElementById('tone3000ModalOverlay'));
    const drumModal = new DrumMachineModal(document.getElementById('drumModalOverlay'));
    const tunerModal = new TunerModal(document.getElementById('tunerModalOverlay'));
    const saveModal = new SaveModal(document.getElementById('saveModalOverlay'));
    const exportModal = new ExportModal(document.getElementById('exportModalOverlay'));
    const slotTransferModal = new SlotTransferModal(document.getElementById('slotTransferModalOverlay'));
    const setlistModal = new SetlistModal(document.getElementById('setlistModalOverlay'));
    const backingTrackModal = new BackingTrackModal(document.getElementById('backingTrackModalOverlay'));
    const stageModeModal = new StageModeModal(document.getElementById('stageModalOverlay'), tunerModal, setlistModal);
    const toneGenModal = new ToneGeneratorModal(document.getElementById('toneGenModalOverlay'));
    const helpModal = new HelpModal(document.getElementById('helpModalOverlay'));
    const importBundleModal = new ImportBundleModal(document.getElementById('importBundleModalOverlay'));
    const shareModal = new SharePresetModal(document.getElementById('shareModalOverlay'), importBundleModal);

    // Store references
    this.signalChain = signalChain;
    this.moduleEditor = moduleEditor;
    this.presetList = presetList;
    this.tone3000Modal = tone3000Modal;
    this.drumModal = drumModal;
    this.tunerModal = tunerModal;
    this.saveModal = saveModal;
    this.exportModal = exportModal;
    this.slotTransferModal = slotTransferModal;
    this.stageModeModal = stageModeModal;
    this.setlistModal = setlistModal;
    this.backingTrackModal = backingTrackModal;
    this.toneGenModal = toneGenModal;
    this.helpModal = helpModal;
    this.importBundleModal = importBundleModal;
    this.shareModal = shareModal;

    // 3. Header Preset Status Listeners
    const slotBadge = document.getElementById('headerSlotBadge');
    const presetNameText = document.getElementById('headerPresetName');
    const dirtyIndicator = document.getElementById('headerDirtyIndicator');

    const updateHeaderBanner = () => {
      slotBadge.textContent = presetEngine.getSlotCode(presetEngine.currentSlot);
      presetNameText.textContent = presetEngine.activePreset.name;
    };

    presetEngine.onStateChange(updateHeaderBanner);
    presetEngine.onSlotChange(updateHeaderBanner);
    presetEngine.onDirtyChange((isDirty) => {
      dirtyIndicator.classList.toggle('visible', isDirty);
    });

    // 4. Header Connection Buttons
    const connLed = document.getElementById('connectionLed');
    const connText = document.getElementById('connectionText');
    const btnConnectUsb = document.getElementById('connectUsbBtn');
    const btnConnectBle = document.getElementById('connectBleBtn');
    const btnDisconnect = document.getElementById('disconnectBtn');

    btnConnectUsb.addEventListener('click', async () => {
      try {
        await connection.connectUsb();
      } catch (err) {
        alert(`USB connection failed: ${err.message}`);
      }
    });

    btnConnectBle.addEventListener('click', async () => {
      try {
        await connection.connectBle();
      } catch (err) {
        alert(`Bluetooth connection failed: ${err.message}`);
      }
    });

    btnDisconnect.addEventListener('click', () => {
      connection.disconnect();
    });

    const connMobileStatus = document.getElementById('connMobileStatus');

    connection.onStatusChange((status) => {
      if (status.isConnected) {
        connLed.classList.add('connected');
        connText.textContent = `${status.type.toUpperCase()}: ${status.deviceName}`;
        if (connMobileStatus) {
          connMobileStatus.textContent = status.type.toUpperCase();
          connMobileStatus.classList.remove('hidden');
        }
        btnConnectUsb.style.display = 'none';
        btnConnectBle.style.display = 'none';
        btnDisconnect.classList.remove('hidden');
        btnDisconnect.style.display = 'inline-flex';

        // Auto sync all Clone Amps, User IRs, and 100 presets on connection
        setTimeout(() => presetEngine.runInitialSyncSequence(), 300);
      } else {
        connLed.classList.remove('connected');
        connText.textContent = 'Non Connesso';
        if (connMobileStatus) {
          connMobileStatus.classList.add('hidden');
        }
        btnConnectUsb.style.display = 'inline-flex';
        btnConnectBle.style.display = 'inline-flex';
        btnDisconnect.classList.add('hidden');
        btnDisconnect.style.display = 'none';
      }
    });

    // 5. Tool Action Buttons
    document.getElementById('btnSyncHardware').addEventListener('click', () => {
      if (!connection.isConnected) {
        alert('Please connect your Smart Box via USB or Bluetooth first.');
        return;
      }
      presetEngine.runInitialSyncSequence();
    });

    document.getElementById('btnAbToggle')?.addEventListener('click', () => {
      presetEngine.toggleAB();
    });
    document.getElementById('btnAbToggleMobile')?.addEventListener('click', () => {
      presetEngine.toggleAB();
    });

    document.getElementById('btnUndo').addEventListener('click', () => {
      presetEngine.undo();
    });

    document.getElementById('btnRedo').addEventListener('click', () => {
      presetEngine.redo();
    });

    document.getElementById('btnOpenDrums').addEventListener('click', () => {
      drumModal.open();
    });

    document.getElementById('btnOpenTuner').addEventListener('click', () => {
      tunerModal.open();
    });

    document.getElementById('btnOpenTone3000').addEventListener('click', () => {
      tone3000Modal.open();
    });

    // Preset Deck Navigation (Prev / Next)
    document.getElementById('btnPrevSlot')?.addEventListener('click', () => {
      const cur = presetEngine.currentSlot;
      presetEngine.selectPreset(cur > 1 ? cur - 1 : 100);
    });

    document.getElementById('btnNextSlot')?.addEventListener('click', () => {
      const cur = presetEngine.currentSlot;
      presetEngine.selectPreset(cur < 100 ? cur + 1 : 1);
    });

    document.getElementById('btnOpenExport')?.addEventListener('click', () => {
      exportModal.open();
    });

    document.getElementById('btnOpenSlotTransfer')?.addEventListener('click', () => {
      slotTransferModal.open();
    });

    document.getElementById('btnOpenToneGen')?.addEventListener('click', () => {
      toneGenModal.open();
    });

    document.getElementById('btnOpenStage')?.addEventListener('click', () => {
      stageModeModal.open();
    });

    document.getElementById('btnOpenHelp')?.addEventListener('click', () => {
      helpModal.open();
    });

    document.getElementById('btnOpenSave')?.addEventListener('click', () => {
      saveModal.open();
    });

    const btnOpenShare = document.getElementById('btnOpenShare');
    if (btnOpenShare) {
      btnOpenShare.addEventListener('click', () => {
        this.shareModal.open();
      });
    }

    // Unified Tools Dropdown Toggle (Desktop & Mobile buttons)
    const btnToolsDropdown = document.getElementById('btnToolsDropdown');
    const btnToolsDropdownMobile = document.getElementById('btnToolsDropdownMobile');
    const toolsMenuDropdown = document.getElementById('toolsMenuDropdown');
    if (toolsMenuDropdown) {
      const toggleDropdown = (e) => {
        e.stopPropagation();
        toolsMenuDropdown.classList.toggle('hidden');
      };

      btnToolsDropdown?.addEventListener('click', toggleDropdown);
      btnToolsDropdownMobile?.addEventListener('click', toggleDropdown);

      document.addEventListener('click', (e) => {
        if (!toolsMenuDropdown.contains(e.target) && e.target !== btnToolsDropdown && e.target !== btnToolsDropdownMobile) {
          toolsMenuDropdown.classList.add('hidden');
        }
      });

      // Auto close dropdown when clicking any tool inside
      toolsMenuDropdown.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          toolsMenuDropdown.classList.add('hidden');
        });
      });
    }

    // Mobile Tone3000 Button
    document.getElementById('btnOpenTone3000Mobile')?.addEventListener('click', () => {
      tone3000Modal.open();
    });

    // Mobile Tools menu buttons
    document.getElementById('btnOpenTunerMenuMobile')?.addEventListener('click', () => {
      tunerModal.open();
    });
    document.getElementById('btnOpenDrumsMenuMobile')?.addEventListener('click', () => {
      drumModal.open();
    });

    // Setlist Manager & Backing Track Player
    document.getElementById('btnOpenSetlist')?.addEventListener('click', () => {
      setlistModal.open();
    });
    document.getElementById('btnOpenBackingTrack')?.addEventListener('click', () => {
      backingTrackModal.open();
    });

    // PWA Install Prompt Handling
    let deferredInstallPrompt = null;
    const btnInstallPwa = document.getElementById('btnInstallPwa');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
    });

    btnInstallPwa?.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          connection.log('Sonicake Studio installato come App nativa!', 'success');
        }
        deferredInstallPrompt = null;
      } else {
        alert("Per installare Sonicake Studio come App nativa:\n\n• Su Chrome / Edge PC: Clicca sull'icona di installazione nella barra degli indirizzi del browser.\n• Su Android / iOS: Apri il menu del browser e seleziona 'Aggiungi a schermata Home' / 'Installa app'.");
      }
    });

    // Register Service Worker for offline PWA operation
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    }

    // Mobile Presets Sidebar Drawer Toggle
    const btnTogglePresetsMobile = document.getElementById('btnTogglePresetsMobile');
    const presetSidebar = document.getElementById('presetSidebar');
    const mobilePresetsBackdrop = document.getElementById('mobilePresetsBackdrop');
    if (btnTogglePresetsMobile && presetSidebar && mobilePresetsBackdrop) {
      const toggleDrawer = () => {
        const isClosed = presetSidebar.classList.contains('-translate-x-full');
        if (isClosed) {
          presetSidebar.classList.remove('-translate-x-full');
          mobilePresetsBackdrop.classList.remove('hidden');
        } else {
          presetSidebar.classList.add('-translate-x-full');
          mobilePresetsBackdrop.classList.add('hidden');
        }
      };
      btnTogglePresetsMobile.addEventListener('click', toggleDrawer);
      mobilePresetsBackdrop.addEventListener('click', toggleDrawer);

      const headerPresetClickArea = document.getElementById('headerPresetClickArea');
      if (headerPresetClickArea) {
        headerPresetClickArea.addEventListener('click', () => {
          if (window.innerWidth < 1024) toggleDrawer();
        });
      }
    }

    // 6. Hardware SysEx Log Drawer
    const logDrawer = document.getElementById('logDrawer');
    const logToggleHeader = document.getElementById('logToggleHeader');
    const logContainer = document.getElementById('logContainer');

    logToggleHeader.addEventListener('click', () => {
      logDrawer.classList.toggle('expanded');
    });

    connection.onLog(({ message, type, time }) => {
      const timeStr = time.toTimeString().split(' ')[0];
      const line = document.createElement('div');
      line.className = `log-line ${type}`;
      line.textContent = `[${timeStr}] ${message}`;
      logContainer.appendChild(line);
      logContainer.scrollTop = logContainer.scrollHeight;
    });
  }

  initShortcuts() {
    window.addEventListener('keydown', (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

      // Ctrl + Shift + S: Share Preset
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.shareModal.open();
        return;
      }

      // Ctrl + S: Save Preset
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveModal.open();
        return;
      }

      // Ctrl + Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (!isInput) {
          e.preventDefault();
          presetEngine.undo();
        }
        return;
      }

      // Ctrl + Y or Ctrl + Shift + Z: Redo
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (!isInput) {
          e.preventDefault();
          presetEngine.redo();
        }
        return;
      }

      // Alt + A: Toggle A/B
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        presetEngine.toggleAB();
        return;
      }

      // Alt + S: Open Setlist / Scaletta Live
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.setlistModal.open();
        return;
      }

      // F: Toggle Stage Mode (when not typing in an input)
      if (!isInput && (e.key.toLowerCase() === 'f') && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (this.stageModeModal.isOpen()) {
          this.stageModeModal.close();
        } else {
          this.stageModeModal.open();
        }
        return;
      }

      // ?: Help guide (when not typing in an input)
      if (!isInput && e.key === '?') {
        e.preventDefault();
        this.helpModal.open();
        return;
      }
    });
  }

  async checkAvailableMidi() {
    try {
      const devices = await connection.getAvailableUsbDevices();
      const smartBox = devices.find(d => d.name.toLowerCase().includes('smart box') || d.name.toLowerCase().includes('sonic'));
      if (smartBox) {
        connection.log(`Found Smart Box hardware on USB MIDI: "${smartBox.name}"`, 'success');
      }
    } catch (e) {
      // Ignore initial probe error
    }
  }

  initDragAndDrop() {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      const isBundle = file.name.endsWith('.sonicbundle') || file.name.endsWith('.json');
      if (isBundle) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            if (parsed && parsed.preset) {
              if (parsed.tone3000Model) {
                this.importBundleModal.open(parsed, () => {
                  connection.log(`Bundle "${parsed.preset.name}" importato con successo!`, 'success');
                });
              } else {
                presetEngine.applyPresetBundle(parsed, {});
                connection.log(`Bundle "${parsed.preset.name}" applicato!`, 'success');
              }
            }
          } catch (err) {
            console.error('Failed to parse dropped bundle:', err);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  checkSharedUrlOnLaunch() {
    try {
      const hash = window.location.hash;
      if (!hash) return;

      if (hash.startsWith('#preset=') || hash.startsWith('#share=')) {
        connection.log('Rilevato preset condiviso da URL hash...', 'info');
        const bundle = decodePresetBundle(hash);

        if (bundle && bundle.preset) {
          setTimeout(() => {
            if (bundle.tone3000Model) {
              // Ask user for destination slot
              this.importBundleModal.open(bundle, (imported) => {
                connection.log(`Preset condiviso "${imported.preset.name}" caricato con successo!`, 'success');
              });
            } else {
              presetEngine.applyPresetBundle(bundle, {});
              connection.log(`Preset condiviso "${bundle.preset.name}" caricato con successo!`, 'success');
            }
            // Clean hash URL without triggering page reload
            window.history.replaceState(null, '', window.location.pathname);
          }, 350);
        }
      }
    } catch (e) {
      console.warn('Errore lettura preset condiviso da URL:', e);
    }
  }

  openTone3000ForReplacement(options) {
    if (this.tone3000Modal) {
      this.tone3000Modal.openForReplacement(options);
    }
  }
}

// Launch application on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

// Cleanly release USB MIDI & BLE driver handles on page reload / unload
window.addEventListener('beforeunload', () => {
  if (connection && connection.isConnected) {
    connection.disconnect();
  }
});
