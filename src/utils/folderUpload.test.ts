import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectUniqueFolderPaths,
  normalizeRelativePath,
  normalizeUploadInput,
  splitRelativePath,
} from './folderUpload.ts';

test('normalizeRelativePath cleans Windows slashes and traversal segments', () => {
  assert.equal(
    normalizeRelativePath('\\Proyek\\assets\\..\\logo.png'),
    'Proyek/assets/logo.png'
  );
  assert.equal(normalizeRelativePath('/A//B/./C/'), 'A/B/C');
});

test('splitRelativePath separates nested folders and file name', () => {
  assert.deepEqual(splitRelativePath('Desain/UI/2026/hero.png'), {
    folderSegments: ['Desain', 'UI', '2026'],
    fileName: 'hero.png',
    parentFolderPath: 'Desain/UI/2026',
  });

  assert.deepEqual(splitRelativePath('dokumen.pdf'), {
    folderSegments: [],
    fileName: 'dokumen.pdf',
    parentFolderPath: null,
  });
});

test('collectUniqueFolderPaths produces deduplicated top-down ancestor order', () => {
  const paths = collectUniqueFolderPaths(
    [
      { relativePath: 'Proyek/src/components/Button.tsx' },
      { relativePath: 'Proyek/src/App.tsx' },
      { relativePath: 'Proyek/README.md' },
      { relativePath: 'Foto/Liburan/pantai.jpg' },
    ],
    ['ArsipKosong/SubKosong']
  );

  assert.deepEqual(paths, [
    'ArsipKosong',
    'Foto',
    'Proyek',
    'ArsipKosong/SubKosong',
    'Foto/Liburan',
    'Proyek/src',
    'Proyek/src/components',
  ]);
});

test('normalizeUploadInput reads webkitRelativePath from File objects', () => {
  const fileA = new File(['hello'], 'catatan.txt', { type: 'text/plain' });
  Object.defineProperty(fileA, 'webkitRelativePath', {
    value: 'FolderKu/sub/catatan.txt',
    configurable: true,
  });

  const fileB = new File(['data'], 'root.txt', { type: 'text/plain' });

  const normalized = normalizeUploadInput([fileA, fileB]);
  assert.equal(normalized.entries.length, 2);
  assert.equal(normalized.entries[0].relativePath, 'FolderKu/sub/catatan.txt');
  assert.equal(normalized.entries[1].relativePath, 'root.txt');
  assert.deepEqual(normalized.emptyFolderPaths, []);
});
