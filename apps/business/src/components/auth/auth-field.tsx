import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

interface AuthFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function AuthField({
  label,
  error,
  style,
  ...props
}: AuthFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCorrect={false}
        placeholderTextColor="#738179"
        selectionColor="#C7E36F"
        style={[styles.input, error ? styles.inputError : null, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
  },
  label: {
    color: '#C7D2CB',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#365044',
    backgroundColor: '#15241E',
    color: '#F5F8F6',
    fontSize: 15,
    paddingHorizontal: 15,
  },
  inputError: {
    borderColor: '#D87168',
  },
  error: {
    color: '#F0A29A',
    fontSize: 12,
    lineHeight: 17,
  },
});
