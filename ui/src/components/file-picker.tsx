"use client";

// FilePicker: add one file or several, by the button or by dropping them,
// with the limits said before one tries (how many, how big, which kinds),
// each file removable, and progress while it goes straight to the Chest.
//
// The tool gives `upload(file, { onProgress, signal })`: it asks its server
// for a signed upload address (files.uploadUrl), sends the bytes (the kit's
// putWithProgress does it with progress), and resolves with what its form
// will send (the stored object's name, a claim) — or with an error in the
// reader's language. Without `upload`, the files stay in the browser and
// the tool reads them (an importer). Checking the bytes on the server
// (sniffing the real type) remains the tool's job.
import { useEffect, useId, useRef, useState, type DragEvent, type ReactElement, type ReactNode } from "react";
import { acceptText, checkFiles, fileSize, refusalText, type FileRules, type Progress } from "./files.js";
import { CameraIcon, CloseIcon, FileIcon, UploadIcon } from "./icons.js";
import { fill } from "./text.js";
import { en, type FileWords } from "./words.js";

export type PickedFile = {
  readonly key: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  // The browser's file (kept while the page lives; an importer reads it).
  readonly file: File | null;
  readonly status: "sending" | "ready" | "failed";
  // 0 … 1 while sending.
  readonly progress: number;
  // What the upload answered (the tool's reference to the stored file).
  readonly ref: string | null;
  readonly error: string | null;
};

export type Upload = (file: File, options: { onProgress: Progress; signal: AbortSignal }) => Promise<{ ok: true; ref: string } | { ok: false; error: string }>;

export type FilePickerProps = FileRules & {
  readonly label: string;
  readonly files: readonly PickedFile[];
  readonly onChange: (update: (current: readonly PickedFile[]) => PickedFile[]) => void;
  readonly upload?: Upload;
  // On a phone: open the camera ("environment" for a receipt) — the only
  // way offered. `camera` offers both instead (0.2.2).
  readonly capture?: "user" | "environment";
  // On a phone (a touch screen): "Take a photo" (the camera, the back one
  // unless "user") beside "Choose a file" (the phone's files and photos).
  // Elsewhere the one button. Photos are images: `accept` should allow them.
  readonly camera?: boolean | "user" | "environment";
  // Something of the tool's own in each file's row, before its name: a
  // thumbnail of a photo (the stored file's address once sent, or
  // URL.createObjectURL(file.file) where the tool's policy allows img-src
  // blob: — the kit does not know the policy, so it draws none) (0.2.2).
  readonly preview?: (file: PickedFile) => ReactNode;
  // Show the label above the drop zone (it is read by screen readers in
  // any case, after the button's words) (0.2.2).
  readonly showLabel?: boolean;
  // The file input's id (a <label for> or an error link of the tool's own) (0.2.2).
  readonly id?: string;
  readonly name?: string;
  readonly disabled?: boolean;
  readonly labels?: FileWords;
  readonly className?: string;
};

let counter = 0;
const nextKey = () => `f${++counter}-${Date.now().toString(36)}`;

// filesReady: every file sent (a form waits for it before submitting).
export const filesReady = (files: readonly PickedFile[]) => files.every(f => f.status === "ready");

export function FilePicker({ label, files, onChange, upload, accept, maxSize, maxFiles, capture, camera = false, preview, showLabel = false, id: givenId, name, disabled = false, labels = en.files, className }: FilePickerProps): ReactElement {
  const auto = useId();
  const id = givenId ?? auto;
  const input = useRef<HTMLInputElement>(null);
  const sep = labels.separator ?? en.files.separator!;
  const [problems, setProblems] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const multiple = maxFiles === undefined || maxFiles > 1;
  const full = maxFiles !== undefined && files.length >= maxFiles;
  const rules: FileRules = { ...(accept ? { accept } : {}), ...(maxSize !== undefined ? { maxSize } : {}), ...(maxFiles !== undefined ? { maxFiles } : {}) };

  useEffect(() => () => { for (const c of controllers.current.values()) c.abort(); }, []);

  function send(key: string, file: File) {
    if (!upload) return;
    const controller = new AbortController();
    controllers.current.set(key, controller);
    let last = 0;
    const onProgress: Progress = fraction => {
      // At most one update per 5 %: a slow phone does not re-render 400 times.
      if (fraction - last < 0.05 && fraction < 1) return;
      last = fraction;
      onChange(list => list.map(f => (f.key === key ? { ...f, progress: fraction } : f)));
    };
    upload(file, { onProgress, signal: controller.signal }).then(
      answer => onChange(list => list.map(f => (f.key !== key ? f : answer.ok ? { ...f, status: "ready", progress: 1, ref: answer.ref, error: null } : { ...f, status: "failed", error: answer.error }))),
      error => {
        if ((error as { name?: string })?.name === "AbortError") return;
        onChange(list => list.map(f => (f.key === key ? { ...f, status: "failed", error: labels.failed } : f)));
      },
    ).finally(() => controllers.current.delete(key));
  }

  function add(chosen: FileList | readonly File[] | null) {
    if (!chosen || disabled) return;
    const { accepted, refused } = checkFiles(files.length, [...chosen], rules);
    setProblems(refused.map(r => refusalText(r, labels, rules)));
    const added: PickedFile[] = accepted.map(file => ({ key: nextKey(), name: file.name, size: file.size, type: file.type, file, status: upload ? "sending" : "ready", progress: 0, ref: null, error: null }));
    if (added.length === 0) return;
    onChange(list => [...list, ...added]);
    for (const f of added) send(f.key, f.file!);
  }

  function remove(key: string) {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    onChange(list => list.filter(f => f.key !== key));
    input.current?.focus();
  }

  function retry(f: PickedFile) {
    if (!f.file) return;
    onChange(list => list.map(x => (x.key === f.key ? { ...x, status: "sending", progress: 0, error: null } : x)));
    send(f.key, f.file);
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer?.files ?? null);
  };
  const limits = [
    maxFiles !== undefined && maxFiles > 1 && maxSize !== undefined ? fill(labels.limits, { count: String(maxFiles), size: fileSize(maxSize, labels) }) : null,
    maxFiles === 1 && maxSize !== undefined ? fill(labels.limitsOne, { size: fileSize(maxSize, labels) }) : null,
    accept && accept.length > 0 ? fill(labels.types, { types: acceptText(accept, labels) }) : null,
  ].filter(Boolean).join(" ");

  const off = disabled || full;
  const onPicked = (e: { currentTarget: HTMLInputElement }) => { const el = e.currentTarget; add(el.files); el.value = ""; };
  const described = limits ? id + "-limits" : undefined;
  return (
    <div className={`ck-files${className ? " " + className : ""}`} {...(showLabel ? { role: "group", "aria-labelledby": id + "-label" } : {})}>
      {showLabel && <span id={id + "-label"} className="ck-label">{label}</span>}
      <div
        className={`ck-drop${over ? " ck-over" : ""}${off ? " ck-disabled" : ""}`}
        onDragOver={e => { if (off) return; e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {camera && (
          <>
            <input id={id + "-camera"} type="file" className="ck-vh ck-file-input" accept="image/*" capture={camera === "user" ? "user" : "environment"} disabled={off} aria-describedby={described} onChange={onPicked} />
            <label htmlFor={id + "-camera"} className="ck-button ck-button-quiet ck-file-camera">
              <CameraIcon />
              <span>{labels.takePhoto ?? en.files.takePhoto}</span>
              <span className="ck-vh">{sep + label}</span>
            </label>
          </>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          className="ck-vh ck-file-input"
          multiple={multiple}
          accept={accept?.join(",")}
          capture={camera ? undefined : capture}
          disabled={off}
          aria-describedby={described}
          onChange={onPicked}
        />
        <label htmlFor={id} className="ck-button ck-button-quiet">
          <UploadIcon />
          {camera
            ? <><span className="ck-file-choose">{labels.chooseFile ?? en.files.chooseFile}</span><span className="ck-file-add">{multiple ? labels.add : labels.addOne}</span></>
            : <span>{multiple ? labels.add : labels.addOne}</span>}
          <span className="ck-vh">{sep + label}</span>
        </label>
        <span className="ck-drop-hint" aria-hidden="true">{multiple ? labels.drop : labels.dropOne ?? labels.drop}</span>
        {limits && <p id={id + "-limits"} className="ck-hint">{limits}</p>}
      </div>
      {files.length > 0 && (
        <ul className="ck-file-list" aria-label={`${label}${sep}${labels.list}`}>
          {files.map(f => (
            <li key={f.key} className={`ck-file ck-file-${f.status}${preview ? " ck-file-with-preview" : ""}`}>
              {preview ? <span className="ck-file-preview">{preview(f) ?? <FileIcon />}</span> : <FileIcon />}
              <span className="ck-file-name">{f.name}</span>
              <span className="ck-file-meta">
                {f.status === "sending" ? fill(labels.sending, { percent: String(Math.round(f.progress * 100)) }) : f.status === "failed" ? f.error ?? labels.failed : fileSize(f.size, labels)}
              </span>
              {f.status === "sending" && <progress className="ck-progress" max={1} value={f.progress} aria-label={f.name} />}
              {f.status === "failed" && f.file && <button type="button" className="ck-button ck-button-link" onClick={() => retry(f)}>{labels.retry}</button>}
              <button type="button" className="ck-icon-button" onClick={() => remove(f.key)}><CloseIcon /><span className="ck-vh">{fill(labels.remove, { name: f.name })}</span></button>
            </li>
          ))}
        </ul>
      )}
      <div role="alert" className="ck-file-problems">{problems.map(p => <p key={p} className="ck-error">{p}</p>)}</div>
      {name && files.filter(f => f.status === "ready" && f.ref).map(f => <input key={f.key} type="hidden" name={name} value={f.ref!} />)}
    </div>
  );
}
