/** @see https://discordjs.guide/popular-topics/faq.html */
import { AttachmentBuilder, Client, ChannelType, GatewayIntentBits, MessagePayload, PermissionFlagsBits } from 'discord.js'

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent, /** @see https://support-dev.discord.com/hc/en-us/articles/4404772028055 */
    ]
});

/** `$ DISCORD_BOT_TOKEN=${YOUR_TOKEN} npx ts-node index.ts transfer-channels [source_server] [dest_server]` */
(async ([mode, source, dest, ...args]) => {
    client.on('ready', async () => {
        switch (mode) {
            case 'transport-channels':
                const sourceServer = client.guilds.cache.find(guild => guild.name === source)!
                const destServer = client.guilds.cache.find(guild => guild.name === dest)!
                /** prevent too many notifications for users. adminstrators and bot implicitly allowed. */
                const parent = await destServer.channels.create({
                    name: sourceServer.name,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        { id: destServer.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }
                    ]
                })
                const sourceChannels = await sourceServer.channels.fetch()

                await Promise.all(sourceChannels.map(async (sourceCh) => {
                    if (sourceCh.viewable && sourceCh.type === ChannelType.GuildText) {
                        const destCh = await (await destServer.channels.create({ name: sourceCh.name, type: ChannelType.GuildText, parent }))!
                        /** fetch messages. */
                        let messageId: string | undefined
                        do {
                            const messages = await sourceCh.messages.fetch({ limit: 100, after: messageId ?? '0' })
                            messageId = messages.firstKey()
                            for (const [_, message] of messages.reverse()) {
                                console.log(new Date(message.createdTimestamp).toISOString(), `#${destCh.name}`, `<${message.author.username}>`, message.content)
                                try {
                                    /** download attached images in message. */
                                    const files = await Promise.all(
                                        Object.values(Object.fromEntries(message.attachments))
                                            .map(_ => _.attachment.toString())
                                            .map(async (url) => new AttachmentBuilder(Buffer.from(await (await (fetch(url))).arrayBuffer()))))
                                    /** send message. */
                                    await destCh.send(new MessagePayload(destCh, {
                                        files,
                                        embeds: [
                                            {
                                                author: {
                                                    icon_url: message.author.avatarURL() ?? 'https://cdn.discordapp.com/embed/avatars/1.png',
                                                    name: message.author?.username,
                                                },
                                                timestamp: new Date(message.createdTimestamp).toISOString(),
                                                description: message.content,
                                            },
                                            ...message.embeds
                                        ],
                                    }))
                                } catch (error) {
                                    console.warn({ error, url: message.url })
                                }
                            }
                        } while (messageId)
                    }
                }))
                break
            case 'danger-purge-all-channels':
                const devServer = client.guilds.cache.find(guild => guild.name === source)!
                await Promise.all(devServer.channels.cache.map(cache => devServer.channels.delete(cache.id)))
                break
            default:
                throw new Error(`INVALID_MODE: ${mode}`)
        }
        process.exit(0)
    })
    await client.login(process.env.DISCORD_BOT_TOKEN)
})(process.argv.slice(2))
