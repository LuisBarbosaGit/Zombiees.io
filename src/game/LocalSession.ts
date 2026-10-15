import { Simulation } from './Simulation';
import type { InputFrame, WorldState } from './types';

/** Local implementation of the session boundary. A WebSocket client can replace it later. */
export class LocalSession {
  readonly simulation: Simulation;

  constructor(name: string) {
    this.simulation = new Simulation(name);
  }

  get state(): WorldState {
    return this.simulation.state;
  }

  submit(input: InputFrame, elapsedSeconds: number): void {
    this.simulation.step(input, elapsedSeconds);
  }
}
