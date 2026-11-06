# Frozen saved sessions

Files written by the real `serializeSession` and `createProjectFile` of the last commit of each schema version. They stand in for what users still have on disk, so they are never regenerated or edited: a change that breaks one of them breaks real saved work.

| Schema | Commit    | Files                            |
| ------ | --------- | -------------------------------- |
| V5     | `34955d5` | `session-v05.*`                  |
| V6     | `e6a3f11` | `session-v06.*`                  |
| V7     | `fcd25d9` | `session-v07.*`                  |
| V8     | `7c2e899` | `session-v08.*`                  |
| V8     | `30c9498` | `session-v08-invalid-polygons.*` |
| V9     | `137f6e8` | `session-v09.*`                  |
| V10    | `979d86a` | `session-v10.*`                  |
| V11    | `7afa5f0` | `session-v11.*`                  |
| V12    | `5b19126` | `session-v12.*`                  |
| V13    | `9f47ebb` | `session-v13.*`                  |
| V14    | `a65f8c6` | `session-v14.*`                  |
| V16    | `906d89a` | `session-v16.*`                  |

- `.serialized`: the text stored in IndexedDB, byte for byte.
- `.planmeasure`: the project file exported by that build (V11 onwards), embedding `plan-bytes.bin`.
- `.expected.json`: the complete V17 session each one must migrate to. It is the saved session plus explicit defaults for later fields, not the output of the migration code.

`session-v08-invalid-polygons` comes from the commit just before polygons had to be simple, so its polygons on page 3 can only be opened in recovery.
