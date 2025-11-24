import { relations } from "drizzle-orm/relations";
import { conversations, supervisorTasks } from "./schema";

export const supervisorTasksRelations = relations(supervisorTasks, ({one}) => ({
	conversation: one(conversations, {
		fields: [supervisorTasks.conversationId],
		references: [conversations.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({many}) => ({
	supervisorTasks: many(supervisorTasks),
}));