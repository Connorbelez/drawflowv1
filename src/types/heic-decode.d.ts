declare module "heic-decode" {
  interface HeicDecodeResult {
    data: Uint8ClampedArray;
    height: number;
    width: number;
  }

  export default function decodeHeic(input: {
    buffer: Uint8Array;
  }): Promise<HeicDecodeResult>;
}
