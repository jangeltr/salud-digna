export function trustLocalProxy(address: string, hop: number): boolean {
  return hop === 0 && address === '127.0.0.1';
}
