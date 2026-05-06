import Editor, { useMonaco } from '@monaco-editor/react';
import { useEffect } from 'react';
import shellyTypesSource from '@/client/shelly-types/shelly.d.ts?raw';

const SHELLY_TYPES_PATH = 'file:///shelly-globals.d.ts';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  readOnly?: boolean;
}

export function ScriptEditor({ value, onChange, height = '60vh', readOnly }: ScriptEditorProps) {
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;

    const jsDefaults = monaco.languages.typescript.javascriptDefaults;
    const alreadyRegistered = jsDefaults
      .getExtraLibs()
      // Extra libs are keyed by the virtual file path we pass below.
      ? Object.keys(jsDefaults.getExtraLibs()).includes(SHELLY_TYPES_PATH)
      : false;
    if (!alreadyRegistered) {
      jsDefaults.addExtraLib(shellyTypesSource, SHELLY_TYPES_PATH);
    }

    jsDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    jsDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2015,
      allowNonTsExtensions: true,
      lib: ['es2015'],
    });
  }, [monaco]);

  return (
    <Editor
      height={height}
      defaultLanguage="javascript"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        tabSize: 2,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        readOnly,
      }}
    />
  );
}
