export const DRUM_STYLES = [
  { id: 'rock', name: 'Rock', range: [0, 15] },
  { id: 'pop', name: 'Pop', range: [16, 29] },
  { id: 'blues', name: 'Blues', range: [30, 42] },
  { id: 'jazz', name: 'Jazz', range: [43, 54] },
  { id: 'funk', name: 'Funk', range: [55, 67] },
  { id: 'electronic', name: 'Electronic', range: [68, 79] },
  { id: 'world', name: 'World', range: [80, 89] },
  { id: 'metro', name: 'Metronome', range: [90, 99] }
];

export const DRUM_PATTERNS = Array.from({ length: 100 }, (_, i) => {
  let style = 'rock';
  let defaultBpm = 120;
  let timeSig = '4/4';

  if (i < 16) {
    style = 'rock';
    defaultBpm = 120 + (i % 5) * 8;
  } else if (i < 30) {
    style = 'pop';
    defaultBpm = 110 + (i % 6) * 5;
  } else if (i < 43) {
    style = 'blues';
    defaultBpm = 95 + (i % 4) * 10;
    if (i % 3 === 0) timeSig = '12/8';
  } else if (i < 55) {
    style = 'jazz';
    defaultBpm = 130 + (i % 4) * 15;
    if (i % 4 === 1) timeSig = '3/4';
  } else if (i < 68) {
    style = 'funk';
    defaultBpm = 105 + (i % 5) * 6;
  } else if (i < 80) {
    style = 'electronic';
    defaultBpm = 128 + (i % 4) * 4;
  } else if (i < 90) {
    style = 'world';
    defaultBpm = 100 + (i % 5) * 10;
    if (i % 3 === 2) timeSig = '6/8';
  } else {
    style = 'metro';
    defaultBpm = 120;
    const sigs = ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8', '9/8', '12/8', 'Free', 'Click'];
    timeSig = sigs[i - 90] || '4/4';
  }

  return {
    id: i,
    number: (i + 1).toString().padStart(2, '0'),
    name: `Pattern ${i + 1} (${timeSig})`,
    style,
    defaultBpm,
    timeSig
  };
});
