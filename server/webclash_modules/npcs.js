//NPCs module for WebClash Server

const fs = require('fs');

exports.onMap = [];

exports.cache = [];

exports.sendMap = function(map, socket)
{
    //Check if valid
    
    if (this.onMap[map] === undefined)
        return;
    
    //Cycle through all NPCs and send to socket
    
    for (let i = 0; i < this.onMap[map].length; i++)
        server.syncNPC(map, i, socket, false);
}

exports.loadMap = function(map)
{
    //Check if map has (NPC) properties
    
    if (tiled.maps_properties[map] === undefined)
        return;
    
    //Cycle through all properties, and search
    //for the "NPC" value
    
    for (let i = 0; i < tiled.maps_properties[map].length; i++)
        if (tiled.maps_properties[map][i].name == 'NPC') {
            //Check if onMap at map is undefined
            
            if (this.onMap[map] === undefined)
                this.onMap[map] = [];
            
            //Create NPC
            
            this.createNPCs(tiled.maps_properties[map][i], map)
        }
};

exports.updateMaps = function()
{
    //Check if a map contains players,
    //if so update the NPCs
    
    for (let i = 0; i < tiled.maps.length; i++)
        if (io.sockets.adapter.rooms[i] !== undefined &&
            io.sockets.adapter.rooms[i].length > 0)
            this.updateMap(i);
};

exports.updateMap = function(map)
{
    //Check if valid
    
    if (this.onMap[map] === undefined)
        return;
    
    //Cycle through all NPCs and update
    //accordingly
    
    for (let i = 0; i < this.onMap[map].length; i++)
        if (this.onMap[map][i] !== undefined)
            this.updateNPC(map, i);
};

exports.createNPCs = function(npc_property, map_id)
{    
    //Cycle through all dimensions
    
    for (let i = 0; i < npc_property.rectangles.length; i++)
    {
        //Get specified NPC
    
        let npc = {
            data: this.loadNPC(npc_property.value)
        };
        
        if (npc.data === undefined)
            continue;
        
        //Setup NPC
        
        npc.id = this.onMap[map_id].length;
        npc.pos = {
            X: npc_property.rectangles[i].x,
            Y: npc_property.rectangles[i].y
        };
        npc.movement = {
            vel: {
                x: 0,
                y: 0
            },
            distance: 0,
            cur: 0,
            standard: 60
        };
        npc.moving = false;
        npc.direction = 0;
        
        this.onMap[map_id].push(npc);
    }
};

exports.loadNPC = function(name)
{
    try 
    {
        if (this.cache[name] !== undefined)
            return this.cache[name];
        
        let location = 'npcs/' + name + '.json';
        
        let npc = JSON.parse(fs.readFileSync(location, 'utf-8'));
        npc.character = game.characters[npc.character];
        
        this.cache[name] = npc;
    }
    catch(err)
    {
        output.give(err);
    }
    
    return this.cache[name];
}

exports.updateNPC = function(map, id)
{
    try {
        //Update NPC movement

        this.updateNPCMovement(map, id);

        //...
    }
    catch (err)
    {
        output.give('Could not update NPC: ' + err);
    }
};

exports.updateNPCMovement = function(map, id)
{
    if (this.onMap[map][id].data.movement == 'free')
    {
        //Check if already moving

        if (this.onMap[map][id].moving) {             
            //Evaluate movement 

            switch (this.onMap[map][id].direction)
            {
                case 0:
                    if (this.onMap[map][id].movement.vel.y < this.onMap[map][id].data.character.movement.max)
                        this.onMap[map][id].movement.vel.y += this.onMap[map][id].data.character.movement.acceleration;
                    break;
                case 1:
                    if (this.onMap[map][id].movement.vel.x > -this.onMap[map][id].data.character.movement.max)
                        this.onMap[map][id].movement.vel.x -= this.onMap[map][id].data.character.movement.acceleration;
                    break;
                case 2:
                    if (this.onMap[map][id].movement.vel.x < this.onMap[map][id].data.character.movement.max)
                        this.onMap[map][id].movement.vel.x += this.onMap[map][id].data.character.movement.acceleration;
                    break;
                case 3:
                    if (this.onMap[map][id].movement.vel.y > -this.onMap[map][id].data.character.movement.max)
                        this.onMap[map][id].movement.vel.y -= this.onMap[map][id].data.character.movement.acceleration;
                    break;
            }

            //Add movement velocity
            this.onMap[map][id].pos.X+=this.onMap[map][id].movement.vel.x;
            this.onMap[map][id].pos.Y+=this.onMap[map][id].movement.vel.y;

            //Check and add distance

            if (Math.abs(this.onMap[map][id].movement.vel.x) > Math.abs(this.onMap[map][id].movement.vel.y)) {
                if (this.onMap[map][id].movement.distance >= tiled.maps[map].tilewidth)
                        this.onMap[map][id].moving = false;
                else 
                    this.onMap[map][id].movement.distance += Math.abs(this.onMap[map][id].movement.vel.x);
            }
            else {
                if (this.onMap[map][id].movement.distance >= tiled.maps[map].tileheight)
                        this.onMap[map][id].moving = false;
                else
                    this.onMap[map][id].movement.distance += Math.abs(this.onMap[map][id].movement.vel.y);
            }


            //Sync new position

            server.syncNPCPartially(map, id, 'position');

            //If moving is set to false, sync

            if (!this.onMap[map][id].moving)
                server.syncNPCPartially(map, id, 'moving');
        }

        //(Otherwise) Check movement timeout

        else if (this.onMap[map][id].movement.cur >= this.onMap[map][id].movement.standard) {
            //Reset NPC movement

            this.onMap[map][id].movement.vel.x = 0;
            this.onMap[map][id].movement.vel.y = 0;
            this.onMap[map][id].movement.distance = 0;
            this.onMap[map][id].movement.cur = 0;
            this.onMap[map][id].movement.standard = 60 + Math.round(Math.random()*120);

            //Set random direction

            this.onMap[map][id].direction = Math.round(Math.random()*3);

            //Check facing collision
            
            if (!this.checkNPCFacingCollision(map, id)) {
                //Start moving
                
                this.onMap[map][id].moving = true; 
                
                //Sync moving
                
                server.syncNPCPartially(map, id, 'moving');
            }

            //Sync direction

            server.syncNPCPartially(map, id, 'direction');
        }
        else
            this.onMap[map][id].movement.cur++;
    }
};

exports.checkNPCFacingCollision = function(map, id)
{
    let rect = {
        x: this.onMap[map][id].pos.X,
        y: this.onMap[map][id].pos.Y,
        w: tiled.maps[map].tilewidth,
        h: tiled.maps[map].tileheight
    };
    
    //Get supposed pos based on direction
    
    switch (this.onMap[map][id].direction)
    {
        case 0:
            rect.y += rect.h;
            break;
        case 1:
            rect.x -= rect.w;
            break;
        case 2:
            rect.x += rect.w;
            break;
        case 3:
            rect.y -= rect.h;
            break;
    };
    
    //Check if outside map
    
    if (!tiled.checkRectangleInMap(map, rect))
        return true;
    
    //Check collision inside map
    
    if (tiled.checkCollisionWithRectangle(tiled.maps[map].name, rect))
        return true;
    
    return false;
};