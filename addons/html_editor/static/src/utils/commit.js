/**
 * @typedef { string } EditorCommitId
 * @typedef { "standard" | "undo" | "redo" | "restore" | "savePoint" } EditorCommitType
 * @typedef { Exclude<EditorCommitType, "savePoint"> } WritableEditorCommitType
 */
/**
 * @template { EditorCommitType } [T=WritableEditorCommitType]
 * @typedef { Record<string, any> & {
 *   authorTimestamp?: number,
 *   commitTimestamp?: number,
 *   previousCommitId?: EditorCommitId,
 * } & (
 *   T extends "savePoint" | "restore"
 *     ? {}
 *     : { batchable: boolean }
 * ) & (
 *   T extends "standard"
 *     ? {}
 *     : {
 *         origin: EditorCommit<(
 *           T extends "undo"
 *             ? "standard" | "redo"
 *             : ( T extends "redo" ? "undo" : WritableEditorCommitType )
 *         )>
 *       }
 * ) & (
 *   T extends "savePoint"
 *     ? {
 *         hasBeenRestored: boolean,
 *         lastRevertedChanges?: EditorCommitData<WritableEditorCommitType>,
 *       }
 *     : ()
 * ) } EditorCommitData<T>
 */

/**
 * @template { EditorCommitType } [T=WritableEditorCommitType]
 */
export class EditorCommit {
    /**
     * @param { Object } [param0 = {}]
     * @param { EditorCommitId } [param0.id = this.generateId()]
     * @param { T } [param0.type = "standard"]
     * @param { EditorCommitData<T> } [param0.data = {}]
     */
    constructor({ id = this.generateId(), type = "standard", data = {} } = {}) {
        /** @type { EditorCommitId } */
        this.id = id;
        /** @type { T } */
        this.type = type;
        /** @type { EditorCommitData<T> } */
        this.data = data;
    }

    /**
     * @param { keyof EditorCommitData<T> } key
     * @param {any} value
     */
    updateData(key, value) {
        this.data[key] = value;
    }

    /**
     * @returns { EditorCommitId }
     */
    generateId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }
}
