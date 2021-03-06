//Items module for WebClash Server

const fs = require('fs');

exports.collection = [];
exports.onMap = [];

exports.getItem = function(name)
{
    let id = this.getItemIndex(name);
    if (id == -1)
        return;

    return this.collection[id];
};

exports.getConvertedItem = function(name)
{
    let item = this.getItem(name);

    if (item == undefined)
        return;

    //Grab the basic item info

    let result = {
        name: item.name,
        type: item.type,
        rarity: item.rarity,
        description: item.description,
        source: item.source,
        value: item.value,
        minLevel: item.minLevel,
        sounds: item.sounds
    };

    //Delete unwanted/unnecessary properties
    //based on item type

    switch (item.type) {
        case 'consumable':
            result.actionIcon = item.actionIcon;

            result.consumableAction = item.consumableAction;
            result.consumableActionUses = item.consumableActionUses;

            result.heal = item.heal;
            result.mana = item.mana;
            result.gold = item.gold;
            break;
        case 'equipment':
            result.actionIcon = item.actionIcon;

            result.equippable = item.equippable;
            result.equippableAction = item.equippableAction;
            result.equippableSource = item.equippableSource;

            result.stats = item.stats;
            result.scaling = item.scaling;
            break;
        case 'dialog':
            result.dialog = item.dialog;
            result.consumableDialog = item.consumableDialog;
            break;
    };

    return result;
};

exports.getItemIndex = function(name)
{
    for (let i = 0; i < this.collection.length; i++)
        if (this.collection[i].name === name)
            return i;

    return -1;
};

exports.loadAllItems = function(cb)
{
    let location = 'items';

    fs.readdir(location, (err, files) => {
        let count = 0;

        files.forEach(file => {
            let item = items.loadItem(location + '/' + file);
            item.name = file.substr(0, file.lastIndexOf('.'));

            if (item.equippableAction !== '')
                item.scaling = actions.getAction(item.equippableAction).scaling;

            items.collection.push(item);

            count++;
        });

        output.give('Loaded ' + count + ' item(s).');

        if (cb !== undefined)
            cb();
    });
};

exports.loadItem = function(location)
{
    try {
        //Create object

        let object = JSON.parse(fs.readFileSync(location, 'utf-8'));

        //Create action icon if equippable or consumable action exists

        let action;

        if (object.type === 'consumable' &&
            object.consumableAction.length > 0)
            action = actions.getAction(object.consumableAction);

        if (object.type === 'equipment' &&
            object.equippableAction.length > 0)
            action = actions.getAction(object.equippableAction);

        if (action !== undefined)
            object.actionIcon = action.src;

        //Return object

        return object;
    }
    catch (err)
    {
        output.giveError('Could not load item: ', err);
    }
};

exports.addPlayerItem = function(socket, id, name)
{
    //Get free slot

    let slot = this.getPlayerFreeSlot(id);

    //Check if slot is valid

    if (slot == -1)
        return false;

    //Check if item is valid

    let item = this.getItemIndex(name);

    if (item == -1)
        return false;

    //Add item

    game.players[id].inventory[slot] = name;

    //Evaluate item for gather objectives

    quests.evaluateQuestObjective(id, 'gather', name);

    //Sync player item

    server.syncInventoryItem(slot, id, socket);

    return true;
};

exports.hasPlayerItem = function(id, name)
{
    //Check if item with name exists

    for (let i = 0; i < game.players[id].inventory.length; i++)
        if (game.players[id].inventory[i] === name)
            return true;

    return false;
};

exports.getPlayerItemAmount = function(id, name)
{
    let result = 0;

    for (let i = 0; i < game.players[id].inventory.length; i++)
        if (game.players[id].inventory[i] === name)
            result++;

    return result;
};

exports.usePlayerItem = function(socket, id, name)
{
    //Get item

    let item = this.getItem(name);

    //Check if valid

    if (item === undefined)
        return false;

    //Check if minimal item level matches player level

    if (item.minLevel !== 0 &&
        game.players[id].level < item.minLevel)
        return false;

    //Check if piece of equipment

    if (item.type === 'equipment')
    {
        //Check if the item differs from the equipped item

        if (game.players[id].equipment[item.equippable] !== undefined &&
            game.players[id].equipment[item.equippable] === name)
            return false;

        //Set equipment and if it is not possible return

        if (!this.setPlayerEquipment(socket, id, item))
            return false;

        //Remove player item

        this.removePlayerItem(id, name);
    }

    //Check if consumable

    if (item.type === 'consumable')
    {
        //Consume item

        game.healPlayer(id, item.heal);
        game.deltaManaPlayer(id, item.mana);

        //Gold

        game.deltaGoldPlayer(id, item.gold);

        //Add action

        if (!actions.addPlayerAction(item.consumableAction, id, item.consumableActionUses))
            return false;

        //Remove player item

        this.removePlayerItem(id, name);
    }

    //Check if dialog

    if (item.type === 'dialog')
    {
        //Start dialog

        server.syncItemDialog(id, item.name, item.dialog);

        //Consume item if necessary

        if (item.consumableDialog)
            this.removePlayerItem(id, name);
    }

    return true;
};

exports.removePlayerItem = function(id, name)
{
    //Remove item from inventory

    for (let i = 0; i < game.players[id].inventory.length; i++)
        if (game.players[id].inventory[i] === name) {
            //Remove element

            game.players[id].inventory[i] = undefined;

            //Evaluate item for gather objectives

            quests.evaluateQuestObjective(id, 'gather', name);

            //Sync to player

            server.syncInventoryItem(i, id, game.players[id].socket, false);

            break;
        }
};

exports.setPlayerEquipment = function(socket, id, item)
{
    //Get equippable

    let equippable = item.equippable;

    //Check if equippable already exists,
    //if so add it to the inventory.
    //If this is not possible return.

    if (game.players[id].equipment[equippable] !== undefined)
        if (!this.addPlayerItem(socket, id, game.players[id].equipment[equippable]))
            return false;

    //Set equipment equippable of player

    game.players[id].equipment[equippable] = item.name;

    //Equip if action is available

    if (item.equippableAction.length > 0) {
        //Set action at 0 if main

        if (equippable === 'main')
            actions.setPlayerAction(socket, item.equippableAction, 0, id);

        //Set action at 1 if offhand

        if (equippable === 'offhand')
            actions.setPlayerAction(socket, item.equippableAction, 1, id);
    }

    //Calculate new attributes

    game.calculatePlayerStats(id, true);

    //Sync to others

    server.syncPlayerPartially(id, 'equipment', socket, true);

    //Sync equipment to player

    server.syncEquipmentItem(equippable, id, socket, false);

    //Return true

    return true;
};

exports.getPlayerFreeSlot = function(id)
{
    //Search for a undefined/non-existing slot

    for (let i = 0; i < game.playerConstraints.inventory_size; i++)
        if (game.players[id].inventory[i] == null)
            return i;

    //Otherwise return an invalid slot

    return -1;
};

exports.createWorldItem = function(owner, map, x, y, name)
{
    //Get item

    let item = this.getItem(name);

    //Check if valid

    if (item == undefined)
        return;

    //Check if owner should be global or single player

    let ownerName = owner;

    if (ownerName != -1)
        ownerName = game.players[owner].name;

    //Create world item on map

    if (this.onMap[map] == undefined)
        this.onMap[map] = [];

    let worldItem = {
        owner: ownerName,
        name: name,
        pos: {
            X: x,
            Y: y
        },
        source: item.source,
        rarity: item.rarity,
        value: item.value
    };

    //Add world item to map

    for (let i = 0; i < this.onMap[map].length+1; i++)
        if (this.onMap[map][i] == undefined)
        {
            worldItem.id = i;

            this.onMap[map][i] = {
                owner: owner,
                item: worldItem,
                timer: {
                    cur: 0,
                    releaseTime: 30, //30 seconds for item release
                    removeTime: 60   //60 seconds for item removal
                }
            };

            break;
        }

    //Sync across map

    server.syncWorldItem(map, worldItem);
};

exports.releaseWorldItemsFromOwner = function(map, owner)
{
    //Check if valid

    if (this.onMap[map] == undefined)
        return;

    //Cycle through all items on map

    for (let i = 0; i < this.onMap[map].length; i++)
    {
        if (this.onMap[map][i] === undefined)
            continue;

        if (this.onMap[map][i].item.owner == owner)
        {
            //Set owner to -1

            this.onMap[map][i].item.owner = -1;

            //Sync world item

            server.syncWorldItem(map, this.onMap[map][i].item);
        }
    }
};

exports.releaseWorldItemFromOwner = function(map, item)
{
    //Check if valid

    if (this.onMap[map] === undefined)
        return;

    //Set owner to -1

    this.onMap[map][item].item.owner = -1;

    //Sync world item

    server.syncWorldItem(map, this.onMap[map][item].item);
};

exports.pickupWorldItem = function(map, id, item)
{
    //Check if valid

    if (this.onMap[map] === undefined ||
        this.onMap[map][item] === undefined)
        return false;

    //Check owner

    if (this.onMap[map][item].item.owner != -1 &&
        this.onMap[map][item].item.owner !== game.players[id].name)
        return false;

    //Attempt to add item

    if (!this.addPlayerItem(game.players[id].socket, id, this.onMap[map][item].item.name))
        return false;

    //Remove world item

    this.removeWorldItem(map, item);

    //Return true

    return true;
};

exports.removeWorldItem = function(map, item)
{
    //Check if valid

    if (this.onMap[map] === undefined)
        return;

    //Set as remove object

    this.onMap[map][item].item = {
        id: item,
        remove: true
    };

    //Sync world item

    server.syncWorldItem(map, this.onMap[map][item].item);

    //Remove world item

    this.onMap[map][item] = undefined;
};

exports.updateMaps = function()
{
    //Cycle through all maps

    for (let m = 0; m < this.onMap.length; m++)
    {
        //Check if map is valid

        if (this.onMap[m] === undefined)
            continue;

        //Cycle through all items

        for (let i = 0; i < this.onMap[m].length; i++)
        {
            if (this.onMap[m][i] === undefined)
                continue;

            this.onMap[m][i].timer.cur++;

            //Check if item should be released of it's owner

            if (this.onMap[m][i].timer.cur >= this.onMap[m][i].timer.releaseTime &&
                this.onMap[m][i].owner != -1)
                this.releaseWorldItemFromOwner(m, i);

            //Check if item should be removed

            if (this.onMap[m][i].timer.cur >= this.onMap[m][i].timer.removeTime)
                this.removeWorldItem(m, i);
        }
    }
};

exports.sendMap = function(map, socket)
{
    //Check if valid

    if (this.onMap[map] == undefined ||
        this.onMap[map].length == 0)
        return;

    //Send all items in map

    for (let i = 0; i < this.onMap[map].length; i++)
        if (this.onMap[map][i] !== undefined)
            server.syncWorldItem(map, this.onMap[map][i].item, socket, false);
};
