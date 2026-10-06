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

class App {
  constructor() {
    this.initUI();
    this.initShortcuts();
    this.checkAvailableMidi();
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

    // Store references
    this.signalChain = signalChain;
    this.moduleEditor = moduleEditor;
    this.presetList = presetList;
    this.tone3000Modal = tone3000Modal;
    this.drumModal = drumModal;
    this.tunerModal = tunerModal;
    this.saveModal = saveModal;

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

    connection.onStatusChange((status) => {
      if (status.isConnected) {
        connLed.classList.add('connected');
        connText.textContent = `${status.type.toUpperCase()}: ${status.deviceName}`;
        btnConnectUsb.style.display = 'none';
        btnConnectBle.style.display = 'none';
        btnDisconnect.style.display = 'inline-flex';

        // Auto sync preset names and state on connection
        setTimeout(() => presetEngine.syncPresetNames(), 300);
      } else {
        connLed.classList.remove('connected');
        connText.textContent = 'Disconnected';
        btnConnectUsb.style.display = 'inline-flex';
        btnConnectBle.style.display = 'inline-flex';
        btnDisconnect.style.display = 'none';
      }
    });

    // 5. Tool Action Buttons
    document.getElementById('btnSyncHardware').addEventListener('click', () => {
      if (!connection.isConnected) {
        alert('Please connect your Smart Box via USB or Bluetooth first.');
        return;
      }
      presetEngine.syncPresetNames();
    });

    document.getElementById('btnAbToggle').addEventListener('click', () => {
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

    document.getElementById('btnOpenSave').addEventListener('click', () => {
      saveModal.open();
    });

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

      // Ctrl + S: Save Preset
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
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
}

// Launch application on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
