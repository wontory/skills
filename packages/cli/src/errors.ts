/** Thrown when the user cancels a prompt (ctrl+c / esc). Exits with 130. */
export class CancelledError extends Error {
  constructor() {
    super('Operation cancelled.')
    this.name = 'CancelledError'
  }
}
