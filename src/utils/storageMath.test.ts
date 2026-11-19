import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THREE_TERABYTES_BYTES,
  calculateUploadMetrics,
  canAcceptUpload,
  classifyFileCategory,
  computeStorageBreakdown,
  extractExtension,
  formatBytes,
  formatStorageGb,
} from './storageMath';

test('extractExtension handles standard, multi-dot, and extensionless filenames', () => {
  assert.equal(extractExtension('report.final.pdf'), 'pdf');
  assert.equal(extractExtension('NOVA_RENDER.PNG'), 'png');
  assert.equal(extractExtension('README'), '');
  assert.equal(extractExtension('.gitignore'), '');
});

test('classifyFileCategory maps all requested formats accurately', () => {
  assert.equal(classifyFileCategory('photo.webp'), 'photos');
  assert.equal(classifyFileCategory('diagram.svg'), 'photos');
  assert.equal(classifyFileCategory('cinema.mkv'), 'videos');
  assert.equal(classifyFileCategory('clip.mov'), 'videos');
  assert.equal(classifyFileCategory('master.flac'), 'audio');
  assert.equal(classifyFileCategory('podcast.mp3'), 'audio');
  assert.equal(classifyFileCategory('proposal.docx'), 'documents');
  assert.equal(classifyFileCategory('budget.xlsx'), 'documents');
  assert.equal(classifyFileCategory('deck.pptx'), 'documents');
  assert.equal(classifyFileCategory('schema.json'), 'documents');
  assert.equal(classifyFileCategory('backup.7z'), 'archives');
  assert.equal(classifyFileCategory('bundle.rar'), 'archives');
  assert.equal(classifyFileCategory('design.fig'), 'others');
  assert.equal(classifyFileCategory('app.apk'), 'others');
  assert.equal(classifyFileCategory('poster.psd'), 'others');
});

test('computeStorageBreakdown calculates dynamic category totals against 3 TB quota', () => {
  const breakdown = computeStorageBreakdown([
    { category: 'photos', sizeBytes: 120_000_000, isTrashed: false },
    { category: 'videos', sizeBytes: 450_000_000, isTrashed: false },
    { category: 'documents', sizeBytes: 30_000_000, isTrashed: false },
    { category: 'audio', sizeBytes: 50_000_000, isTrashed: false },
    { category: 'archives', sizeBytes: 200_000_000, isTrashed: false },
    { category: 'others', sizeBytes: 150_000_000, isTrashed: false },
  ]);

  assert.equal(breakdown.quotaBytes, THREE_TERABYTES_BYTES);
  assert.equal(breakdown.usedBytes, 1_000_000_000);
  assert.equal(breakdown.availableBytes, 2_999_000_000_000);
  assert.equal(breakdown.fileCount, 6);
  assert.equal(breakdown.categories.photos.bytes, 120_000_000);
  assert.equal(breakdown.categories.videos.count, 1);
  assert.ok(breakdown.usedPercent > 0 && breakdown.usedPercent < 1);
});

test('canAcceptUpload enforces 3 TB quota boundary strictly', () => {
  const almostFull = THREE_TERABYTES_BYTES - 10_000;
  const ok = canAcceptUpload(almostFull, 10_000);
  assert.equal(ok.allowed, true);
  assert.equal(ok.overflowBytes, 0);

  const over = canAcceptUpload(almostFull, 10_001);
  assert.equal(over.allowed, false);
  assert.equal(over.overflowBytes, 1);
  assert.equal(over.remainingBytes, 10_000);
});

test('formatBytes and formatStorageGb render crisp human-readable sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1_500_000), '1.5 MB');
  assert.equal(formatBytes(3_000_000_000_000), '3 TB');
  assert.equal(formatStorageGb(245_000_000_000), '245 GB');
  assert.equal(formatStorageGb(3_000_000_000_000), '3.000 GB');
});

test('calculateUploadMetrics computes percent, throughput, and ETA', () => {
  const metrics = calculateUploadMetrics(5_000_000, 10_000_000, 2);
  assert.equal(metrics.percent, 50);
  assert.equal(metrics.speedBps, 2_500_000);
  assert.equal(metrics.etaSeconds, 2);
});
