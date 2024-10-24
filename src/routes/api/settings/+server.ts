import { invalidAuth } from '$lib/server/auth';
import { MiscDB } from '$lib/server/db.js';
import { error, success } from '$lib/server/responses.js';
import { isSettingRequest, SettingsResponse } from '$lib/types/requests';

const settingKey = 'settings';

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;
    return success(fetchSettings());
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const query = await e.request.json();
    if (!isSettingRequest(query))
        return error('Invalid request body', 400);
    
    saveSettings(query.settingsJson);
    return success();
}

function saveSettings(json: string) {
    if (!json)
        throw new Error('invalid settings json');
    const settings: Record<string, string> = JSON.parse(json);
    const db = new MiscDB();
    const old = JSON.parse(db.get(settingKey) ?? '{}');
    const newJson = JSON.stringify({
        ...old,
        ...settings,
    });
    db.set(settingKey, newJson);
    db.close();
}

function fetchSettings(): SettingsResponse {
    const db = new MiscDB();
    const content = db.get(settingKey);
    db.close();

    return {
        settingsJson: content ?? '{}',
    };
}