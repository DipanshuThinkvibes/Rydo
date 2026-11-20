import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { DEFAULT_ORG_FEATURES, ORG_FEATURE_INFO, type OfficeInput, type OrgFeatures } from '@rydo/shared';
import { api, RequestError } from '@/lib/api';
import { colors } from '@/lib/theme';
import { Icon } from '@/components/icons';
import { PlacePicker } from '@/components/place-picker';
import { PlatformScreen } from '@/components/platform-screen';
import { Badge, Button, Card, Chip, ChipRow, Field, Notice, s, SwitchRow } from '@/components/ui';

const STEPS = ['Company', 'People', 'Offices', 'Plan & features', 'Review'] as const;
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function newPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const a = Crypto.getRandomBytes(10);
  return Array.from(a, (n, i) => (i % 4 === 3 ? String(n % 10) : chars[n % chars.length])).join('') + '7';
}

/** Web /platform/clients/new: set up a company on RYDO in five steps. */
export default function NewClient() {
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState({ name: '', slug: '', slugEdited: false, domains: '', timezone: 'Asia/Kolkata' });
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [admin, setAdmin] = useState({ name: '', email: '', password: '', sameAsContact: true });
  const [sendWelcome, setSendWelcome] = useState(true);
  const [offices, setOffices] = useState<OfficeInput[]>([]);
  const [picking, setPicking] = useState(false);
  const [features, setFeatures] = useState<OrgFeatures>(DEFAULT_ORG_FEATURES);
  const [limit, setLimit] = useState('');
  const [radius, setRadius] = useState('1000');
  const [costPerKm, setCostPerKm] = useState('');
  const [error, setError] = useState<{ text: string; fields?: Record<string, string> }>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; welcomeSent: boolean } | null>(null);

  // Accepts "acme.com", "@acme.com", a pasted email or a web address, and keeps only the domain.
  const domains = [...new Set(company.domains.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^.*@/, '').replace(/^www\./, '').replace(/[/?#].*$/, '')).filter(Boolean))];
  const badDomain = domains.find((d) => !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d));
  const adminFinal = admin.sameAsContact ? { ...admin, name: contact.name, email: contact.email } : admin;
  const adminDomainOk = !adminFinal.email || domains.includes(adminFinal.email.split('@')[1] ?? '');
  const keys = Object.keys(ORG_FEATURE_INFO) as (keyof OrgFeatures)[];

  const checks: (() => string | null)[] = [
    () => (company.name.trim().length < 2 ? 'Enter the company name.' : !/^[a-z0-9-]{2,40}$/.test(company.slug) ? 'Short name: 2–40 lowercase letters, digits or dashes.' : domains.length === 0 ? 'Add at least one email domain, like acme.com.' : badDomain ? `"${badDomain}" is not a valid domain. Use something like acme.com.` : null),
    () => (!contact.name.trim() || !/\S+@\S+\.\S+/.test(contact.email) ? "Add the client's contact name and email." : !adminFinal.name.trim() || !/\S+@\S+\.\S+/.test(adminFinal.email) ? "Add the first admin's name and email." : !adminDomainOk ? `The admin must use a company email (${domains.join(', ')}).` : admin.password && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(admin.password) ? 'Password: 8+ characters with a letter and a digit.' : null),
    () => null,
    () => (limit && (!/^\d+$/.test(limit) || Number(limit) < 1) ? 'Seat limit must be a whole number, or empty for no limit.' : null),
    () => null,
  ];
  const next = () => {
    const msg = checks[step]();
    if (msg) return setError({ text: msg });
    setError(undefined);
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ id: string; welcomeSent: boolean }>('POST', '/admin/platform/clients', {
        company: { name: company.name.trim(), slug: company.slug, emailDomains: domains, timezone: company.timezone },
        contact: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() || undefined },
        admin: { name: adminFinal.name.trim(), email: adminFinal.email.trim(), password: admin.password || undefined },
        offices,
        settings: { pickupRadiusMeters: Number(radius), ...(costPerKm ? { costPerKmEstimate: Number(costPerKm) } : {}) },
        features,
        maxEmployees: limit ? Number(limit) : null,
        sendWelcome,
      });
      setDone(r);
    } catch (e) {
      setError(e instanceof RequestError ? { text: e.message, fields: e.fields } : { text: "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PlatformScreen title={`${company.name} is on RYDO`}>
        <Card style={{ gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={30} color={colors.onLime} />
          </View>
          <Text style={s.small}>
            {done.welcomeSent ? `We emailed ${adminFinal.email} how to sign in.` : `Tell ${adminFinal.name} to sign in with ${adminFinal.email}.`}
            {admin.password ? ' Share the temporary password with them privately.' : ' They set a password with “Forgot password?”.'}
          </Text>
          {admin.password ? (
            <View style={{ alignSelf: 'stretch', gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.surface }}>
              <Text style={s.small}>Temporary password for {adminFinal.email}</Text>
              <Text selectable style={{ fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: 1 }}>{admin.password}</Text>
              <Button small variant="soft" label="Share privately" onPress={() => Share.share({ message: admin.password })} />
              <Text style={[s.small, { fontSize: 12 }]}>Shown only now. Send it privately (not in the welcome email); they should change it after signing in.</Text>
            </View>
          ) : null}
          <Button label="Open client" onPress={() => router.replace({ pathname: '/platform/clients/[id]', params: { id: done.id } } as Href)} style={{ alignSelf: 'stretch' }} />
          <Button variant="ghost" label="All clients" onPress={() => router.replace('/platform/clients')} style={{ alignSelf: 'stretch' }} />
        </Card>
      </PlatformScreen>
    );
  }

  const review: [string, string][] = [
    ['Company', `${company.name} (${company.slug})`],
    ['Email domains', domains.join(', ')],
    ['Time zone', company.timezone],
    ['Contact', `${contact.name} · ${contact.email}${contact.phone ? ` · ${contact.phone}` : ''}`],
    ['First admin', `${adminFinal.name} · ${adminFinal.email}`],
    ['Sign-in', admin.password ? 'Temporary password (share privately)' : 'They set it with “Forgot password?”'],
    ['Welcome email', sendWelcome ? 'Yes' : 'No'],
    ['Offices', offices.length ? offices.map((o) => o.name + (o.isDefault ? ' (main)' : '')).join(', ') : 'None yet'],
    ['Modules', (['share', 'enterprise', 'campus'] as const).filter((k) => features[k]).map((k) => ORG_FEATURE_INFO[k].label).join(', ') || 'None'],
    ['Options', (['womenOnly', 'autoAcceptTeam', 'costShare'] as const).map((k) => `${ORG_FEATURE_INFO[k].label}: ${features[k] ? 'on' : 'off'}`).join(' · ')],
    ['Seat limit', limit ? `${limit} employees` : 'No limit'],
    ['Ride rules', `Pickup within ${Number(radius) >= 1000 ? `${Number(radius) / 1000} km` : `${radius} m`}${costPerKm ? ` · ₹${costPerKm}/km` : ''}`],
  ];

  return (
    <PlatformScreen title="Add a client" sub="Set up a company on RYDO in one go. You can change all of this later.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel="Steps">
        {STEPS.map((label, i) => (
          <Pressable
            key={label}
            disabled={i >= step}
            onPress={() => setStep(i)}
            accessibilityState={{ selected: i === step, disabled: i > step }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: i === step ? colors.inkBg : i < step ? colors.lime : colors.surface2 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: i === step ? colors.onInk : i < step ? colors.onLime : colors.muted }}>{i < step ? '✓' : i + 1}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: i === step ? colors.onInk : i < step ? colors.onLime : colors.muted }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Notice tone="error">{error.text}{error.fields ? ` (${Object.values(error.fields).join(', ')})` : ''}</Notice> : null}

      <Card style={{ gap: 12 }}>
        {step === 0 ? (
          <>
            <Field label="Company name" placeholder="Acme Technologies" value={company.name} onChangeText={(v) => setCompany({ ...company, name: v, slug: company.slugEdited ? company.slug : slugify(v) })} />
            <Field label="Short name (used in links)" placeholder="acme" autoCapitalize="none" value={company.slug} onChangeText={(v) => setCompany({ ...company, slug: slugify(v), slugEdited: true })} />
            <Field label="Work email domains" placeholder="acme.com, acme.in" autoCapitalize="none" keyboardType="email-address" value={company.domains} onChangeText={(v) => setCompany({ ...company, domains: v })} />
            <Text style={[s.small, { fontWeight: '700', color: colors.ink }]}>Time zone</Text>
            <ChipRow>
              {ZONES.map((z) => (
                <Chip key={z} label={z} selected={company.timezone === z} onPress={() => setCompany({ ...company, timezone: z })} />
              ))}
            </ChipRow>
            <Text style={s.small}>Only people with these email domains can sign up for this company.</Text>
            {domains.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {domains.map((d) => <Badge key={d} tone="neutral">{d}</Badge>)}
              </View>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={s.strong}>Client contact</Text>
            <Field label="Name" value={contact.name} onChangeText={(v) => setContact({ ...contact, name: v })} />
            <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={contact.email} onChangeText={(v) => setContact({ ...contact, email: v })} />
            <Field label="Phone (optional)" keyboardType="phone-pad" value={contact.phone} onChangeText={(v) => setContact({ ...contact, phone: v })} />
            <Text style={[s.strong, { marginTop: 8 }]}>First company admin</Text>
            <SwitchRow label="The contact is also the admin" value={admin.sameAsContact} onChange={(v) => setAdmin({ ...admin, sameAsContact: v })} />
            {!admin.sameAsContact ? (
              <>
                <Field label="Admin name" value={admin.name} onChangeText={(v) => setAdmin({ ...admin, name: v })} />
                <Field label="Admin work email" autoCapitalize="none" keyboardType="email-address" value={admin.email} onChangeText={(v) => setAdmin({ ...admin, email: v })} />
              </>
            ) : null}
            {!adminDomainOk ? <Text style={[s.small, { color: colors.danger }]}>The admin must use a company email ({domains.join(', ')}).</Text> : null}
            <Field label="Temporary password (optional)" autoCapitalize="none" placeholder="Leave empty: they use “Forgot password?”" value={admin.password} onChangeText={(v) => setAdmin({ ...admin, password: v })} />
            <Button small variant="soft" label="✦ Generate" onPress={() => setAdmin({ ...admin, password: newPassword() })} />
            <SwitchRow label="Send a welcome email" value={sendWelcome} onChange={setSendWelcome} />
            <Text style={[s.small, { fontSize: 12 }]}>Tells the admin how to sign in and what to do first.</Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Button variant="soft" label="+ Add an office" onPress={() => setPicking(true)} />
            {offices.length === 0 ? (
              <Text style={s.small}>Offices make pickup and drop one tap for employees, and decide which rides go “to office”. You can skip this; the company admin can add them later.</Text>
            ) : null}
            {offices.map((o, i) => (
              <View key={i} style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="building" size={16} />
                  <Text style={[s.small, { flex: 1 }]} numberOfLines={2}>{o.address}</Text>
                </View>
                <Field label="Office name" value={o.name} onChangeText={(v) => setOffices((all) => all.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button small variant={o.isDefault ? 'lime' : 'ghost'} label={o.isDefault ? 'Main office' : 'Make main'} style={{ flex: 1 }} onPress={() => setOffices((all) => all.map((x, j) => ({ ...x, isDefault: j === i })))} />
                  <Button
                    small
                    variant="ghost"
                    label="Remove"
                    style={{ flex: 1 }}
                    onPress={() => setOffices((all) => all.filter((_, j) => j !== i).map((x, j, arr) => ({ ...x, isDefault: x.isDefault || (arr.every((y) => !y.isDefault) && j === 0) })))}
                  />
                </View>
              </View>
            ))}
            <PlacePicker
              visible={picking}
              title="Add an office"
              saved={[]}
              onClose={() => setPicking(false)}
              onPick={(p) => {
                setPicking(false);
                setOffices((o) => [...o, { name: p.label, address: p.label, lat: p.lat, lng: p.lng, isDefault: o.length === 0 }]);
              }}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={s.strong}>Modules</Text>
            {keys.filter((k) => ORG_FEATURE_INFO[k].module).map((k) => {
              const info = ORG_FEATURE_INFO[k];
              const on = features[k];
              return (
                <Pressable
                  key={k}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => setFeatures({ ...features, [k]: !on })}
                  style={{ gap: 4, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: on ? colors.lime : colors.line, backgroundColor: on ? colors.surface : 'transparent' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[s.strong, { flex: 1, fontSize: 15 }]}>{info.label}</Text>
                    {on ? <Icon name="check" size={16} /> : null}
                  </View>
                  <Text style={[s.small, { fontSize: 12 }]}>{info.hint}</Text>
                  {info.soon ? <Badge tone="neutral">coming later · recorded on plan</Badge> : null}
                </Pressable>
              );
            })}
            <Text style={[s.strong, { marginTop: 8 }]}>Options</Text>
            {keys.filter((k) => !ORG_FEATURE_INFO[k].module).map((k) => (
              <View key={k} style={{ gap: 2 }}>
                <SwitchRow label={ORG_FEATURE_INFO[k].label} value={features[k]} onChange={(v) => setFeatures({ ...features, [k]: v })} />
                <Text style={[s.small, { fontSize: 12 }]}>{ORG_FEATURE_INFO[k].hint}</Text>
              </View>
            ))}
            <Field label="Seat limit (active employees)" keyboardType="number-pad" placeholder="No limit" value={limit} onChangeText={(v) => setLimit(v.replace(/\D/g, ''))} />
            <Text style={[s.small, { fontWeight: '700', color: colors.ink }]}>Pickup distance from route</Text>
            <ChipRow>
              {[{ value: '500', label: '500 m' }, { value: '1000', label: '1 km' }, { value: '2000', label: '2 km' }].map((o) => (
                <Chip key={o.value} label={o.label} selected={radius === o.value} onPress={() => setRadius(o.value)} />
              ))}
            </ChipRow>
            <Field label="Fuel cost per km (₹, optional)" keyboardType="decimal-pad" placeholder="e.g. 9" value={costPerKm} onChangeText={(v) => setCostPerKm(v.replace(/[^\d.]/g, ''))} />
          </>
        ) : null}

        {step === 4
          ? review.map(([k, v]) => (
              <View key={k} style={{ gap: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <Text style={[s.small, { fontSize: 12, fontWeight: '700' }]}>{k}</Text>
                <Text style={{ color: colors.ink, fontSize: 15 }}>{v}</Text>
              </View>
            ))
          : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button variant="ghost" label="Back" disabled={step === 0} style={{ flex: 1 }} onPress={() => setStep((x) => Math.max(0, x - 1))} />
        {step < STEPS.length - 1 ? (
          <Button label="Next" style={{ flex: 1 }} onPress={next} />
        ) : (
          <Button variant="lime" label="Create client" loading={busy} style={{ flex: 1 }} onPress={create} />
        )}
      </View>
    </PlatformScreen>
  );
}
