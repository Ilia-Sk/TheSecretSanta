import { Camera, Mail, Save, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Profile } from '../api';
import { request, uploadFile } from '../api';
import { Avatar, Button, Card, Field } from '../components/ui';
import { useRevealOnView } from '../hooks/useRevealOnView';

export function ProfilePage({
  token,
  profile,
  onSaved,
  onToast
}: {
  token: string;
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const visibleAvatar = previewUrl ?? profile.avatarUrl;
  useRevealOnView(pageRef);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    const form = new FormData(event.currentTarget);

    try {
      const updated = await request<Profile>('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: String(form.get('displayName') ?? '').trim(),
          avatarUrl: profile.avatarUrl
        })
      }, token);
      onSaved(updated);
      setSaved(true);
      onToast('success', 'Профиль обновлен');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось обновить профиль';
      console.error(err);
      setSaved(false);
      onToast('error', message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File | null) {
    if (!file || file.size === 0) return;
    setUploading(true);
    setSaved(false);
    const nextPreview = URL.createObjectURL(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(nextPreview);

    try {
      const updated = await uploadFile<Profile>('/profile/avatar', file, token);
      onSaved(updated);
      setSaved(true);
      onToast('success', 'Аватар обновлен');
      setPreviewUrl(null);
      URL.revokeObjectURL(nextPreview);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить аватар';
      console.error(err);
      setSaved(false);
      onToast('error', message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page profile-page" ref={pageRef}>
      <Card className="profile-card profile-main-card is-visible">
        <section className="profile-hero">
          <div className="avatar-uploader">
            <Avatar name={profile.displayName} avatarUrl={visibleAvatar} size="xl" />
            <label className="avatar-upload-button">
              <Camera size={18} />
              <span>{uploading ? 'Загрузка...' : 'Сменить фото'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(event) => uploadAvatar(event.currentTarget.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div>
            <span className="eyebrow"><UserRound size={15} /> Профиль</span>
            <h1>{profile.displayName}</h1>
            <p><Mail size={16} />{profile.email}</p>
          </div>
        </section>

        <div className="profile-compact-grid">
          <dl className="profile-list">
            <div><dt>Логин</dt><dd>{profile.login}</dd></div>
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
          </dl>

          <form className="profile-form" onSubmit={submit} key={`${profile.id}-${profile.displayName}-${profile.avatarUrl ?? ''}`}>
            <Field label="Отображаемое имя" name="displayName" defaultValue={profile.displayName} maxLength={120} required />
            <Button type="submit" loading={saving}>
              <Save size={17} />
              Сохранить профиль
            </Button>
            {saved && <p className="form-note success-note">Изменения сохранены.</p>}
          </form>
        </div>
      </Card>
    </div>
  );
}
