import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { empty, transition } from './engine';
import { Command, type Workspace } from './contracts';
import { type LocalProfile } from './semantics';
const dir = join(process.cwd(), '.preparation-local'), file = join(dir, 'workspace.json');
type Store = {
    version: 2;
    workspaces: Record<string, Workspace>;
    profile: LocalProfile;
    profileRevision: number;
};
let queue: Promise<unknown> = Promise.resolve();
export const applicationId = (url: string) => createHash('sha256').update(url).digest('hex');
async function load(): Promise<Store> {
    try {
        const data = JSON.parse(await readFile(file, 'utf8'));
        if (data.version === 2)
            return data;
        // Preserve the previous single-application demo without copying its approvals to another site.
        return { version: 2, workspaces: data.capture ? { [applicationId(data.capture.url)]: data } : {}, profile: {}, profileRevision: 0 };
    }
    catch (e: any) {
        if (e.code === 'ENOENT')
            return { version: 2, workspaces: {}, profile: {}, profileRevision: 0 };
        throw e;
    }
}
async function save(store: Store) { await mkdir(dir, { recursive: true, mode: 0o700 }); await writeFile(file + '.tmp', JSON.stringify(store), { mode: 0o600 }); await rename(file + '.tmp', file); }
export async function read(id?: string) { const s = await load(); return id ? s.workspaces[id] || empty() : { applications: Object.entries(s.workspaces).map(([id, w]) => ({ id, title: w.capture?.title || w.capture?.jobId, url: w.capture?.url, revision: w.revision, count: w.capture?.fields.length })), profile: s.profile, profileRevision: s.profileRevision }; }
const ProfileCommand = z.object({ action: z.literal('profile'), revision: z.number().int(), profile: z.object({ full_name: z.string().max(200).optional(), first_name: z.string().max(200).optional(), last_name: z.string().max(200).optional(), email: z.string().max(300).optional(), phone: z.string().max(100).optional(), linkedin: z.string().max(500).optional(), website: z.string().max(500).optional(), city: z.string().max(200).optional() }).strict() }).strict();
export function execute(input: unknown, id?: string) {
    const task = queue.then(async () => {
        const store = await load();
        if ((input as any)?.action === 'profile') {
            const cmd = ProfileCommand.parse(input);
            if (cmd.revision !== store.profileRevision)
                throw Error('409: Profile changed; refresh before saving');
            store.profile = cmd.profile;
            store.profileRevision++;
            await save(store);
            return { profile: store.profile, profileRevision: store.profileRevision };
        }
        const cmd = Command.parse(input);
        const key = cmd.action === 'capture' ? applicationId(cmd.capture.url) : id;
        if (!key)
            throw Error('400: Select an application');
        if (cmd.action === 'capture' && id && key !== id)
            throw Error('409: Application identity changed');
        const result = transition(store.workspaces[key] || empty(), cmd);
        store.workspaces[key] = result.state;
        await save(store);
        return { ...result.output, applicationId: key };
    });
    queue = task.catch(() => { });
    return task;
}
