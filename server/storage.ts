// Storage interface for the Wyshbone Chat Agent
// Currently not used as the app doesn't require data persistence
// Chat messages are stored in frontend state only

export interface IStorage {
  // Add CRUD methods here if needed in the future
}

export class MemStorage implements IStorage {
  constructor() {
    // Memory storage implementation
  }
}

export const storage = new MemStorage();
