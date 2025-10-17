function perlin_fluctuation(
  time: number,
  hash: number,
  center: number,
  amplitude: number,
  frequency: number
): number {
  return center + amplitude * Math.sin(time * frequency + hash);
}

export class PvInverterSimulator {
  private readonly hashNum = 67890;

  private simulateTempature(currentTime: Date): number {
    return perlin_fluctuation(
      currentTime.getTime(),
      this.hashNum,
      30,
      17,
      0.3
    );
  }

  async simulate(currentTime: Date) {
    const temperature = this.simulateTempature(currentTime);
    return { temperature };
  }
}
