import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "src-tauri/resources/sounds");
const sampleRate = 22_050;

function writeWave(name, duration, sampleAt) {
  const sampleCount = Math.floor(sampleRate * duration);
  const pcm = Buffer.alloc(sampleCount * 2);
  const samples = Array.from({ length: sampleCount }, (_, index) => sampleAt(index / sampleRate));
  const peak = Math.max(1, ...samples.map((sample) => Math.abs(sample)));
  samples.forEach((sample, index) => pcm.writeInt16LE(Math.round((sample / peak) * 24_000), index * 2));

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(resolve(outputDirectory, name), Buffer.concat([header, pcm]));
}

function tone(time, frequency, decay, phase = 0) {
  const attack = Math.min(1, time / 0.012);
  return Math.sin(2 * Math.PI * frequency * time + phase) * attack * Math.exp(-time * decay);
}

mkdirSync(outputDirectory, { recursive: true });

writeWave("gentle.wav", 0.45, (time) =>
  0.78 * tone(time, 523.25, 6.5) + 0.22 * tone(time, 784.88, 8.5),
);

writeWave("bell.wav", 0.65, (time) =>
  0.65 * tone(time, 783.99, 4.8) +
  0.25 * tone(time, 1_567.98, 7.5) +
  0.1 * tone(time, 2_351.97, 10),
);

const chimeNotes = [659.25, 783.99, 987.77];
writeWave("chime.wav", 0.85, (time) => chimeNotes.reduce((sum, frequency, index) => {
  const noteStart = index * 0.2;
  return time < noteStart ? sum : sum + tone(time - noteStart, frequency, 6.2) * 0.7;
}, 0));

console.log(`Generated notification sounds in ${outputDirectory}`);
