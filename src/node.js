// The Mac/server versions of the store and catalogue: saved in files, the catalogue read from catalogue.csv.

import fs from 'node:fs';
import path from 'node:path';
import { createStore } from './store.js';
import { createCatalogue } from './catalogue.js';

export function createFileStore(file) {
  return createStore({
    load: () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null),
    persist: (data) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
      fs.renameSync(tmp, file);
    },
  });
}

export function loadCatalogue(file) {
  const cat = createCatalogue(() => fs.readFileSync(file, 'utf8'));
  cat.path = file;
  return cat;
}
