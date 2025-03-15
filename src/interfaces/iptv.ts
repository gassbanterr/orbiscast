export interface ChannelEntry {
    xui_id: number;
    tvg_id?: string;
    tvg_name?: string;
    tvg_logo?: string;
    group_title?: string;
    url: string;
    created_at?: string;
    country?: string;
}

export interface ProgrammeEntry {
    start?: string;
    stop?: string;
    start_timestamp?: number;
    stop_timestamp?: number;
    channel?: string;
    title?: string;
    description?: string;
    created_at?: string;
}
