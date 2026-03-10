import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#08152a',
  panel: '#10274a',
  panel2: '#0c1f3c',
  line: '#27446f',
  text: '#eef4ff',
  muted: '#aac0df',
  ok: '#1ba866',
  warn: '#f0b84f',
  danger: '#db4f4f',
  info: '#4aa8ff',
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 14 },
  screenScroll: { paddingBottom: 20 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 10 },

  panel: {
    backgroundColor: colors.panel2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  input: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 15,
  },

  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },

  button: {
    backgroundColor: '#1e4c87',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3565a3',
    minHeight: 46,
  },
  buttonGhost: { backgroundColor: '#0f2a4d', borderColor: '#365b8c' },
  buttonOk: { backgroundColor: '#197a4e', borderColor: '#2b9f69' },
  buttonWarn: { backgroundColor: '#7b4d14', borderColor: '#a86f25' },
  buttonDanger: { backgroundColor: '#7b2525', borderColor: '#a54242' },
  buttonText: { color: colors.text, fontWeight: '700' },

  sectionTitle: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 8 },

  chip: {
    backgroundColor: '#0f2a4d',
    borderColor: '#365b8c',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: '#1c5f34', borderColor: '#2b9f69' },
  chipText: { color: colors.text, fontWeight: '600' },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
    borderWidth: 1,
  },
  badgeOk: { backgroundColor: '#123f2b', borderColor: '#2b9f69' },
  badgeWarn: { backgroundColor: '#4d3211', borderColor: '#a86f25' },
  badgeDanger: { backgroundColor: '#4d1616', borderColor: '#a54242' },
  badgeInfo: { backgroundColor: '#0f3052', borderColor: '#3d78b8' },
  badgeText: { color: '#eaf3ff', fontWeight: '700', fontSize: 12 },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#0a1b35',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27446f',
    padding: 10,
  },
  kpiLabel: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  kpiValue: { color: colors.text, fontSize: 18, fontWeight: '700' },

  emptyBox: {
    backgroundColor: '#0b1d38',
    borderColor: '#27446f',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  ctaBar: {
    backgroundColor: '#0f2c55',
    borderColor: '#2e5e98',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },

  cameraWrap: {
    height: 240,
    overflow: 'hidden',
    padding: 0,
    borderRadius: 14,
    position: 'relative',
  },
  cameraOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFocusFrame: {
    width: '68%',
    height: '52%',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(234,243,255,0.75)',
    backgroundColor: 'rgba(8,21,42,0.08)',
  },
  cameraHint: {
    marginTop: 10,
    color: '#eaf3ff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(8,21,42,0.5)',
    borderColor: 'rgba(234,243,255,0.35)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  qtyButton: {
    minWidth: 38,
    paddingHorizontal: 10,
  },
});
