-- MySQL dump 10.13  Distrib 5.7.26, for Linux (x86_64)
--
-- Host: localhost    Database: pokebot
-- ------------------------------------------------------
-- Server version	5.7.26-0ubuntu0.18.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `daycare`
--

DROP TABLE IF EXISTS `daycare`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `daycare` (
  `daycare_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `pokemon` bigint(20) unsigned NOT NULL,
  `trainer` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `region` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `levels_gained` int(11) DEFAULT '0',
  `last_move_replaced` int(11) DEFAULT NULL,
  PRIMARY KEY (`daycare_id`),
  UNIQUE KEY `daycare_id_UNIQUE` (`daycare_id`),
  UNIQUE KEY `pokemon_UNIQUE` (`pokemon`),
  KEY `fk_daycare_2` (`trainer`),
  CONSTRAINT `fk_daycare_1` FOREIGN KEY (`pokemon`) REFERENCES `pokemon` (`pokemon_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_daycare_2` FOREIGN KEY (`trainer`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `guilds`
--

DROP TABLE IF EXISTS `guilds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `guilds` (
  `guild_id` varchar(40) NOT NULL,
  `prefix` varchar(10) NOT NULL DEFAULT '#',
  `last_message_sent` varchar(45) DEFAULT NULL,
  `last_user` varchar(40) DEFAULT NULL,
  `channel` varchar(45) NOT NULL COMMENT '																																																																																																																																																																																																																																																																																																																																																																													',
  PRIMARY KEY (`guild_id`),
  UNIQUE KEY `guild_id_UNIQUE` (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `item`
--

DROP TABLE IF EXISTS `item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `item` (
  `item_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `owner` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int(10) unsigned NOT NULL,
  `category` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item',
  `subcategory` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'hold',
  PRIMARY KEY (`item_id`),
  KEY `fk_item_1` (`owner`),
  CONSTRAINT `fk_item_1` FOREIGN KEY (`owner`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=178 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `move`
--

DROP TABLE IF EXISTS `move`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `move` (
  `move_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `pokemon` bigint(20) unsigned NOT NULL,
  `name` varchar(60) NOT NULL,
  `max_pp` int(10) unsigned NOT NULL,
  `current_pp` int(10) unsigned NOT NULL,
  `slot` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`move_id`),
  UNIQUE KEY `move_id_UNIQUE` (`move_id`),
  KEY `fk_move_1_idx` (`pokemon`),
  CONSTRAINT `fk_move_1` FOREIGN KEY (`pokemon`) REFERENCES `pokemon` (`pokemon_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=210 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pokemon`
--

DROP TABLE IF EXISTS `pokemon`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pokemon` (
  `pokemon_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `original_trainer` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_trainer` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `number` int(11) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` text COLLATE utf8mb4_unicode_ci,
  `region` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ball` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_caught` int(10) unsigned NOT NULL,
  `level_current` int(10) unsigned NOT NULL,
  `xp` int(10) unsigned NOT NULL,
  `friendship` int(10) unsigned NOT NULL,
  `stat_hp` int(10) unsigned NOT NULL,
  `iv_hp` int(10) unsigned NOT NULL,
  `ev_hp` int(10) unsigned NOT NULL DEFAULT '0',
  `stat_atk` int(10) unsigned NOT NULL,
  `iv_atk` int(10) unsigned NOT NULL,
  `ev_atk` int(10) unsigned NOT NULL DEFAULT '0',
  `stat_def` int(10) unsigned NOT NULL,
  `iv_def` int(10) unsigned NOT NULL,
  `ev_def` int(10) unsigned NOT NULL DEFAULT '0',
  `stat_spatk` int(10) unsigned NOT NULL,
  `iv_spatk` int(10) unsigned NOT NULL,
  `ev_spatk` int(10) unsigned NOT NULL DEFAULT '0',
  `stat_spdef` int(10) unsigned NOT NULL,
  `iv_spdef` int(10) unsigned NOT NULL,
  `ev_spdef` int(10) unsigned NOT NULL DEFAULT '0',
  `stat_spd` int(10) unsigned NOT NULL,
  `iv_spd` int(10) unsigned NOT NULL,
  `ev_spd` int(10) unsigned NOT NULL DEFAULT '0',
  `type_1` varchar(15) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type_2` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ability` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ability_slot` tinyint(3) unsigned NOT NULL,
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nature` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `form` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shiny` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `lead` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `evolving` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `personality` int(10) unsigned NOT NULL,
  `storage` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `daycare` int(11) unsigned DEFAULT NULL,
  `egg` tinyint(3) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`pokemon_id`),
  UNIQUE KEY `id_UNIQUE` (`pokemon_id`),
  UNIQUE KEY `daycare_UNIQUE` (`daycare`),
  KEY `fk_pokemon_1` (`current_trainer`),
  KEY `fk_pokemon_2` (`original_trainer`),
  CONSTRAINT `fk_pokemon_1` FOREIGN KEY (`current_trainer`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pokemon_2` FOREIGN KEY (`original_trainer`) REFERENCES `user` (`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_pokemon_3` FOREIGN KEY (`daycare`) REFERENCES `daycare` (`daycare_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1055 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user` (
  `user_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` int(11) unsigned NOT NULL DEFAULT '1',
  `region` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(100) CHARACTER SET armscii8 NOT NULL,
  `field` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Walking',
  `lead` int(11) DEFAULT NULL,
  `money` int(10) unsigned NOT NULL DEFAULT '0',
  `lotto` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pokedex` varchar(809) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `idusers_UNIQUE` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_prefs`
--

DROP TABLE IF EXISTS `user_prefs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_prefs` (
  `user_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `react_money` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `react_encounter` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `react_move` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `react_level` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `ping_money` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `ping_move` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `ping_encounter` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `ping_level` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `timezone` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'America/Detroit',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `user_id_UNIQUE` (`user_id`),
  CONSTRAINT `fk_user_prefs_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2019-06-11 17:21:17
