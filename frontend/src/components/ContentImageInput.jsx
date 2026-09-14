import { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export const contentImageUrl = (url) => url?.startsWith('/api/') ? `${process.env.REACT_APP_BACKEND_URL}${url}` : url;

export const ContentImageInput = ({ value = '', onChange, tid, label = 'Image', disabled = false, onUploadState }) => {
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    onUploadState?.(true);
    try {
      const form = new FormData(); form.append('file', file);
      const { data } = await api.post('/admin/uploads', form);
      onChange(data.url);
    } catch (error) { toast.error(error.response?.data?.detail || 'Image upload failed'); }
    finally { setUploading(false); onUploadState?.(false); }
  };
  return <div className="space-y-2 min-w-0" data-testid={`${tid}-field`}>
    <label className="text-xs font-semibold block" htmlFor={`${tid}-url`}>{label}</label>
    <div className="flex gap-2 items-center min-w-0">
      <input id={`${tid}-url`} data-testid={`${tid}-url`} value={value} disabled={disabled || uploading} onChange={e => onChange(e.target.value)} placeholder="Image URL" className="min-w-0 w-full rounded-xl border border-[#E5E6DF] px-3 py-2 text-sm" />
      <label className="pill pill-ghost !px-3 !py-2 shrink-0 cursor-pointer" data-testid={`${tid}-upload`} title="Upload image">
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-testid={`${tid}-file`} disabled={disabled || uploading} onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    </div>
    {value && <img src={contentImageUrl(value)} alt={`${label} preview`} data-testid={`${tid}-preview`} className="h-20 max-w-full rounded-lg object-contain bg-[#F2F2EC]" />}
  </div>;
};