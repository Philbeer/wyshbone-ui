import { WyshboneChatConfig } from "@shared/conversationConfig";

export default function Welcome() {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: WyshboneChatConfig.welcomeHTML }}
    />
  );
}
