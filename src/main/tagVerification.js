import { createHash } from 'node:crypto';
import { File, Picture } from 'node-taglib-sharp';
import { tagKeys, deleteKeys } from './tagEditValues.js';
import { getTagInfo } from './musicMetadata.js';
import { getEncoderFieldsFromNative } from './tags/utils.js';

const normalized = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return Number(value);
  if (Array.isArray(value)) {
    const values = value.map(normalized).filter((item) => item !== null);
    return values.length ? values : null;
  }
  return value;
};
const bytes = (data) => Buffer.from(data?.toByteArray ? data.toByteArray() : data);
const pictures = (items) =>
  items.map((picture) => ({
    hash: createHash('sha256').update(bytes(picture.data)).digest('hex'),
    type: picture.type
  }));

export function expectedTagValues(edit) {
  const expected = {};
  for (const [field, value] of Object.entries(edit.updates)) {
    if (field === 'picture-location') {
      expected.pictures = value === '-' ? [] : pictures([Picture.fromPath(value)]);
    } else if (field === 'pictures') {
      if (value !== '-') throw new Error('Choose artwork with the image picker.');
      expected.pictures = [];
    } else {
      const converter = value === '-' ? deleteKeys[field] : tagKeys[field];
      if (!converter || field === 'like' || field === 'tagTypes')
        throw new Error(`Unsupported file tag: ${field}`);
      const converted = value === '-' ? converter() : converter(value);
      if (typeof converted === 'number' && !Number.isFinite(converted))
        throw new Error(`Invalid number for ${field}`);
      expected[field] = normalized(converted);
    }
  }
  return expected;
}

const matches = (expected, actual) =>
  typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(expected - actual) < 0.00001
    : JSON.stringify(expected) === JSON.stringify(actual);

export async function verifyTagValues(edit, expected) {
  let file;
  try {
    file = File.createFromPath(edit.id);
    let native;
    if (
      Object.keys(expected).some((field) =>
        ['encoder', 'encoderSettings', 'encodedBy'].includes(field)
      )
    ) {
      native = getEncoderFieldsFromNative((await getTagInfo(edit.id)).tags);
    }
    const mismatches = [];
    for (const [field, value] of Object.entries(expected)) {
      const actual =
        field === 'pictures'
          ? pictures(file.tag.pictures || [])
          : normalized(native && field in native ? native[field] : file.tag[field]);
      if (!matches(value, actual)) mismatches.push(field);
    }
    return mismatches.length
      ? {
          status: 'mismatch',
          error: `Saved values did not match the requested edits: ${mismatches.join(', ')}`
        }
      : { status: 'confirmed' };
  } catch (error) {
    return {
      status: 'unavailable',
      error: `Could not verify saved tags: ${error.message || String(error)}`
    };
  } finally {
    file?.dispose();
  }
}
