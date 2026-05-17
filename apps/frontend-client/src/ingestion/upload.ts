import { CreditFeatures, DocumentSource } from '../types';
import { parseDocument, mergeFeatures } from '../ai/parse-document';

export interface UploadedDocument {
  base64: string;
  mediaType: 'application/pdf';
  source: DocumentSource;
}

// Convert a File object to base64 — browser-only
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (data:application/pdf;base64,)
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Process one or more uploaded PDFs and merge features
// parseDocument receives base64 only — never a file path or raw text
export async function processUploads(docs: UploadedDocument[]): Promise<CreditFeatures> {
  if (docs.length === 0) throw new Error('No documents provided');

  const extractions = await Promise.all(
    docs.map((d) => parseDocument(d.base64, d.mediaType, d.source)),
  );

  return mergeFeatures(extractions);
}
