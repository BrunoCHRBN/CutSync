import { StyleSheet, Text, View } from 'react-native';

interface AuthNoticeProps {
  message: string;
  tone?: 'info' | 'danger' | 'success';
  testID?: string;
}

export function AuthNotice({
  message,
  tone = 'info',
  testID,
}: AuthNoticeProps) {
  return (
    <View testID={testID} style={[styles.notice, styles[tone]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 13,
  },
  info: {
    backgroundColor: '#172C25',
    borderColor: '#365B4C',
  },
  danger: {
    backgroundColor: '#321E1C',
    borderColor: '#70413C',
  },
  success: {
    backgroundColor: '#1B3023',
    borderColor: '#42684D',
  },
  text: {
    fontSize: 13,
    lineHeight: 19,
  },
  infoText: {
    color: '#C7D2CB',
  },
  dangerText: {
    color: '#F2B4AD',
  },
  successText: {
    color: '#BDE0C2',
  },
});
