import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

interface Config {
  shellyPassword: string | null;
}

const DEFAULT_CONFIG: Config = {
  shellyPassword: null,
};

class ConfigService {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    try {
      if (existsSync(CONFIG_FILE)) {
        const data = readFileSync(CONFIG_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  getShellyPassword(): string | null {
    return this.config.shellyPassword;
  }

  setShellyPassword(password: string | null): void {
    this.config.shellyPassword = password;
    this.saveConfig();
  }
}

export const configService = new ConfigService();
