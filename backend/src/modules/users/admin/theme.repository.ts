import { ForbiddenException, Injectable } from '@nestjs/common';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { DatabaseService } from '../../../shared/database/database.service';

type ThemeMode = 'basic' | 'advanced';
type ThemeAppearance = 'system' | 'light' | 'dark';
type ThemePreferences = {
  theme_mode: ThemeMode;
  theme_preset: string | null;
  appearance: ThemeAppearance;
  primary_color: string;
  secondary_color: string;
  sidebar_color: string;
};
type UserPreferences = ThemePreferences & {
  compact_mode: boolean;
  low_stock_alerts: boolean;
  default_workspace: 'pos' | 'inventory' | 'reports';
};
type StoreThemePreferences = ThemePreferences & {
  updated_at?: Date | string | null;
};

const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  theme_mode: 'basic',
  theme_preset: 'default',
  appearance: 'light',
  primary_color: '#008967',
  secondary_color: '#005656',
  sidebar_color: '#0f172a',
};

@Injectable()
export class ThemeRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogRepository: ActivityLogRepository,
  ) {}

  async getForUser(userId: number) {
    const user = await this.databaseService.getUserStoreScope(userId);
    await this.ensureUserPreferencesSchema();

    const userRows = await this.databaseService.query<UserPreferences>(
      `
        SELECT
          compact_mode,
          low_stock_alerts,
          default_workspace,
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color
        FROM user_preferences
        WHERE user_id = $1
        LIMIT 1
      `,
      [user.id],
    );

    const storeTheme = user.store_id ? await this.getStoreThemePreferences(user.store_id, user.store_type) : null;
    const userTheme = userRows[0] ?? null;
    const effectiveTheme = this.normalizeThemePreferences(userTheme ?? storeTheme ?? DEFAULT_THEME_PREFERENCES);

    return {
      user_preferences: userTheme ? this.normalizeUserPreferences(userTheme) : null,
      store_theme: storeTheme ? this.normalizeThemePreferences(storeTheme) : null,
      effective_theme: effectiveTheme,
      can_manage_store_theme: this.isStoreManagerRole(user.role) && Boolean(user.store_id),
    };
  }

  async updatePersonal(input: {
    userId: number;
    preferences: Partial<UserPreferences>;
  }) {
    const user = await this.databaseService.getUserStoreScope(input.userId);
    await this.ensureUserPreferencesSchema();
    const preferences = this.normalizeUserPreferences(input.preferences);

    const rows = await this.databaseService.query<UserPreferences>(
      `
        INSERT INTO user_preferences (
          user_id,
          compact_mode,
          low_stock_alerts,
          default_workspace,
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO UPDATE
        SET
          compact_mode = EXCLUDED.compact_mode,
          low_stock_alerts = EXCLUDED.low_stock_alerts,
          default_workspace = EXCLUDED.default_workspace,
          theme_mode = EXCLUDED.theme_mode,
          theme_preset = EXCLUDED.theme_preset,
          appearance = EXCLUDED.appearance,
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          sidebar_color = EXCLUDED.sidebar_color,
          updated_at = CURRENT_TIMESTAMP
        RETURNING
          compact_mode,
          low_stock_alerts,
          default_workspace,
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color
      `,
      [
        user.id,
        preferences.compact_mode,
        preferences.low_stock_alerts,
        preferences.default_workspace,
        preferences.theme_mode,
        preferences.theme_preset,
        preferences.appearance,
        preferences.primary_color,
        preferences.secondary_color,
        preferences.sidebar_color,
      ],
    );

    return this.normalizeUserPreferences(rows[0]);
  }

  async clearPersonal(userId: number) {
    const user = await this.databaseService.getUserStoreScope(userId);
    await this.ensureUserPreferencesSchema();
    await this.databaseService.query(`DELETE FROM user_preferences WHERE user_id = $1`, [user.id]);
    return this.getForUser(user.id);
  }

  async updateStore(input: {
    userId: number;
    preferences: Partial<StoreThemePreferences>;
  }) {
    const user = await this.databaseService.getUserStoreScope(input.userId);

    if (!this.isStoreManagerRole(user.role) || !user.store_id) {
      throw new ForbiddenException('Only store admin or manager accounts can update the store theme.');
    }

    await this.databaseService.ensureStoreSettingsRow(user.store_id, user.store_type);
    const preferences = this.normalizeThemePreferences(input.preferences);

    const rows = await this.databaseService.query<StoreThemePreferences>(
      `
        UPDATE store_settings
        SET
          theme_mode = $1,
          theme_preset = $2,
          appearance = $3,
          primary_color = $4,
          secondary_color = $5,
          sidebar_color = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $7
          AND (store_type = $8 OR store_type IS NULL)
        RETURNING
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color,
          updated_at
      `,
      [
        preferences.theme_mode,
        preferences.theme_preset,
        preferences.appearance,
        preferences.primary_color,
        preferences.secondary_color,
        preferences.sidebar_color,
        user.store_id,
        user.store_type,
      ],
    );

    await this.activityLogRepository.record({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Store Settings',
      action: 'Theme Updated',
      details: `Store theme updated\nPreset: ${preferences.theme_preset ?? 'custom'}\nMode: ${preferences.theme_mode}`,
    });

    return this.normalizeThemePreferences(rows[0]);
  }

  async clearStore(userId: number) {
    const user = await this.databaseService.getUserStoreScope(userId);

    if (!this.isStoreManagerRole(user.role) || !user.store_id) {
      throw new ForbiddenException('Only store admin or manager accounts can reset the store theme.');
    }

    await this.databaseService.ensureStoreSettingsRow(user.store_id, user.store_type);

    await this.databaseService.query(
      `
        UPDATE store_settings
        SET
          theme_mode = $1,
          theme_preset = $2,
          appearance = $3,
          primary_color = $4,
          secondary_color = $5,
          sidebar_color = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $7
          AND (store_type = $8 OR store_type IS NULL)
      `,
      [
        DEFAULT_THEME_PREFERENCES.theme_mode,
        DEFAULT_THEME_PREFERENCES.theme_preset,
        DEFAULT_THEME_PREFERENCES.appearance,
        DEFAULT_THEME_PREFERENCES.primary_color,
        DEFAULT_THEME_PREFERENCES.secondary_color,
        DEFAULT_THEME_PREFERENCES.sidebar_color,
        user.store_id,
        user.store_type,
      ],
    );

    await this.activityLogRepository.record({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Store Settings',
      action: 'Theme Reset',
      details: 'Store theme reset to default for all accounts without a personal override',
    });

    return this.getForUser(user.id);
  }

  private async ensureUserPreferencesSchema() {
    await this.databaseService.query(
      `
        CREATE TABLE IF NOT EXISTS user_preferences (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          compact_mode BOOLEAN NOT NULL DEFAULT FALSE,
          low_stock_alerts BOOLEAN NOT NULL DEFAULT TRUE,
          default_workspace VARCHAR(20) NOT NULL DEFAULT 'pos',
          theme_mode VARCHAR(20) NOT NULL DEFAULT 'basic',
          theme_preset VARCHAR(50) DEFAULT 'default',
          appearance VARCHAR(20) NOT NULL DEFAULT 'light',
          primary_color VARCHAR(20) NOT NULL DEFAULT '#008967',
          secondary_color VARCHAR(20) NOT NULL DEFAULT '#005656',
          sidebar_color VARCHAR(20) NOT NULL DEFAULT '#0f172a',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    );
  }

  private async getStoreThemePreferences(storeId: number, storeType: string | null): Promise<StoreThemePreferences | null> {
    await this.databaseService.ensureStoreSettingsRow(storeId, storeType);

    const rows = await this.databaseService.query<StoreThemePreferences>(
      `
        SELECT
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color,
          updated_at
        FROM store_settings
        WHERE store_id = $1
          AND (store_type = $2 OR store_type IS NULL)
        LIMIT 1
      `,
      [storeId, storeType],
    );

    return rows[0] ?? null;
  }

  private normalizeUserPreferences(input: Partial<UserPreferences> | null | undefined): UserPreferences {
    const theme = this.normalizeThemePreferences(input);

    return {
      compact_mode: Boolean(input?.compact_mode ?? false),
      low_stock_alerts: input?.low_stock_alerts === undefined || input?.low_stock_alerts === null ? true : Boolean(input.low_stock_alerts),
      default_workspace: input?.default_workspace === 'inventory' || input?.default_workspace === 'reports' ? input.default_workspace : 'pos',
      ...theme,
    };
  }

  private normalizeThemePreferences(input: Partial<ThemePreferences> | null | undefined): ThemePreferences {
    return {
      theme_mode: input?.theme_mode === 'advanced' ? 'advanced' : 'basic',
      theme_preset: typeof input?.theme_preset === 'string' && input.theme_preset.trim() ? input.theme_preset : DEFAULT_THEME_PREFERENCES.theme_preset,
      appearance: input?.appearance === 'system' || input?.appearance === 'dark' ? input.appearance : 'light',
      primary_color: this.normalizeHexColor(input?.primary_color, DEFAULT_THEME_PREFERENCES.primary_color),
      secondary_color: this.normalizeHexColor(input?.secondary_color, DEFAULT_THEME_PREFERENCES.secondary_color),
      sidebar_color: this.normalizeHexColor(input?.sidebar_color, DEFAULT_THEME_PREFERENCES.sidebar_color),
    };
  }

  private normalizeHexColor(value: unknown, fallback: string) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  private isStoreManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'INVENTORY_MANAGER' || role === 'POS_ADMIN' || role === 'INVENTORY_ADMIN' || role === 'ADMIN';
  }
}
