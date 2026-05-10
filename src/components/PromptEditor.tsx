import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholderHint?: string;
  rows?: number;
}

export function PromptEditor({ label, value, onChange, placeholderHint, rows = 6 }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {placeholderHint && (
          <span className="text-xs text-gray-500">Use <code>{placeholderHint}</code> for current page text</span>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="font-mono text-sm"
      />
    </div>
  );
}
