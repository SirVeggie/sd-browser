import type { Database as BetterSqlite3, Statement } from 'better-sqlite3';
import path from 'path';
import { datapath } from '../paths';
import { openDatabase } from '../sqlite';

export type SvgenWorkflowRow = {
    id: string;
    name: string;
    workflow: string;
    prompt: string | null;
    sourceImageId: string | null;
    updatedAt: number;
    createdAt: number;
};

export type SvgenLayoutRow = {
    workflowId: string;
    layout: string;
    updatedAt: number;
};

export class SvgenDB {
    private static file = 'svgen.sqlite3';
    private static isOpen = false;
    private static isSetup = false;
    private static db: BetterSqlite3;

    private static stmtListWorkflows: Statement;
    private static stmtGetWorkflow: Statement;
    private static stmtUpsertWorkflow: Statement;
    private static stmtDeleteWorkflow: Statement;
    private static stmtGetLayout: Statement;
    private static stmtUpsertLayout: Statement;
    private static stmtDeleteLayout: Statement;

    private static setup() {
        if (SvgenDB.isOpen)
            return;

        SvgenDB.isOpen = true;
        SvgenDB.db = openDatabase(path.join(datapath, SvgenDB.file));

        if (SvgenDB.isSetup)
            return;
        SvgenDB.isSetup = true;

        SvgenDB.db.exec(`
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                workflow TEXT NOT NULL,
                prompt TEXT,
                sourceImageId TEXT,
                updatedAt INTEGER NOT NULL,
                createdAt INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS layouts (
                workflowId TEXT PRIMARY KEY,
                layout TEXT NOT NULL,
                updatedAt INTEGER NOT NULL
            );
        `);

        SvgenDB.stmtListWorkflows = SvgenDB.db.prepare(
            'SELECT id, name, sourceImageId, updatedAt, createdAt FROM workflows ORDER BY updatedAt DESC',
        );
        SvgenDB.stmtGetWorkflow = SvgenDB.db.prepare('SELECT * FROM workflows WHERE id = ?');
        SvgenDB.stmtUpsertWorkflow = SvgenDB.db.prepare(`
            INSERT INTO workflows (id, name, workflow, prompt, sourceImageId, updatedAt, createdAt)
            VALUES (@id, @name, @workflow, @prompt, @sourceImageId, @updatedAt, @createdAt)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                workflow = excluded.workflow,
                prompt = excluded.prompt,
                sourceImageId = excluded.sourceImageId,
                updatedAt = excluded.updatedAt
        `);
        SvgenDB.stmtDeleteWorkflow = SvgenDB.db.prepare('DELETE FROM workflows WHERE id = ?');
        SvgenDB.stmtGetLayout = SvgenDB.db.prepare('SELECT * FROM layouts WHERE workflowId = ?');
        SvgenDB.stmtUpsertLayout = SvgenDB.db.prepare(`
            INSERT INTO layouts (workflowId, layout, updatedAt)
            VALUES (@workflowId, @layout, @updatedAt)
            ON CONFLICT(workflowId) DO UPDATE SET
                layout = excluded.layout,
                updatedAt = excluded.updatedAt
        `);
        SvgenDB.stmtDeleteLayout = SvgenDB.db.prepare('DELETE FROM layouts WHERE workflowId = ?');
    }

    static listWorkflowSummaries(): Omit<SvgenWorkflowRow, 'workflow' | 'prompt'>[] {
        SvgenDB.setup();
        return SvgenDB.stmtListWorkflows.all() as Omit<SvgenWorkflowRow, 'workflow' | 'prompt'>[];
    }

    static getWorkflow(id: string): SvgenWorkflowRow | undefined {
        SvgenDB.setup();
        return SvgenDB.stmtGetWorkflow.get(id) as SvgenWorkflowRow | undefined;
    }

    static upsertWorkflow(row: SvgenWorkflowRow): void {
        SvgenDB.setup();
        SvgenDB.stmtUpsertWorkflow.run(row);
    }

    static deleteWorkflow(id: string): boolean {
        SvgenDB.setup();
        const result = SvgenDB.stmtDeleteWorkflow.run(id);
        SvgenDB.stmtDeleteLayout.run(id);
        return result.changes > 0;
    }

    static getLayout(workflowId: string): SvgenLayoutRow | undefined {
        SvgenDB.setup();
        return SvgenDB.stmtGetLayout.get(workflowId) as SvgenLayoutRow | undefined;
    }

    static upsertLayout(row: SvgenLayoutRow): void {
        SvgenDB.setup();
        SvgenDB.stmtUpsertLayout.run(row);
    }
}
