export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
  const digest = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
