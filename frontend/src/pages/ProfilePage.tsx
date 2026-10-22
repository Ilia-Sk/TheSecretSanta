import { Camera, KeyRound, Mail, Save, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { Profile } from '../api';
import { request, uploadFile } from '../api';
import { motion } from 'motion/react';
import { Avatar, Button, Card, Field } from '../components/ui';

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
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const visibleAvatar = previewUrl ?? profile.avatarUrl;

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
    <div className="page profile-page">
      <motion.section
        className="profile-hero"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      >
        <motion.div
          className="avatar-uploader"
          variants={{ hidden: { opacity: 0, scale: 0.6, rotateY: 90 }, show: { opacity: 1, scale: 1, rotateY: 0, transition: { type: 'spring', stiffness: 180, damping: 16 } } }}
        >
          <motion.div className="avatar-ring" whileHover={{ scale: 1.04, rotate: 4 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
            <Avatar name={profile.displayName} avatarUrl={visibleAvatar} size="xl" />
          </motion.div>
          <label className={uploading ? 'avatar-upload-button is-loading' : 'avatar-upload-button'}>
            <Camera size={16} />
            <span>{uploading ? 'Загрузка...' : 'Сменить фото'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(event) => uploadAvatar(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
        </motion.div>
        <motion.span variants={heroItem} className="eyebrow"><UserRound size={14} /> Профиль</motion.span>
        <motion.h1 variants={heroItem}>{profile.displayName}</motion.h1>
        <motion.p variants={heroItem}><Mail size={16} />{profile.email}</motion.p>
      </motion.section>

      <div className="profile-grid">
        <Card className="profile-card">
          <span className="tile-icon"><KeyRound size={18} /></span>
          <h2>Данные аккаунта</h2>
          <dl className="profile-list">
            <div><dt>Логин</dt><dd>{profile.login}</dd></div>
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
          </dl>
        </Card>

        <Card className="profile-card" delay={0.08}>
          <span className="tile-icon"><UserRound size={18} /></span>
          <h2>Как вас видят другие</h2>
          <form className="profile-form" onSubmit={submit} key={`${profile.id}-${profile.displayName}-${profile.avatarUrl ?? ''}`}>
            <Field label="Отображаемое имя" name="displayName" defaultValue={profile.displayName} maxLength={120} required />
            <Button type="submit" loading={saving}>
              <Save size={17} />
              Сохранить профиль
            </Button>
            {saved && <p className="form-note success-note">Изменения сохранены.</p>}
          </form>
        </Card>
      </div>
    </div>
  );
}

const heroItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } }
};
