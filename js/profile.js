async function loadProfile() {
    const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    if (data) currentProfile = data;
}
